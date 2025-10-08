const Exam=require('../models/Exam');
const Question=require('../models/Question');
const asyncHandler=require('../utils/asyncHandler');
const {
    getDefaultStarterTemplate,
    getLanguageLabel
}=require('../utils/codeTemplates');
const { parse }=require('csv-parse/sync');
const { repairQuestionCorrectOptions }=require('../utils/repairQuestionCorrectOptions');

const validationError=(message,status=400)=>{
    const error=new Error(message);
    error.status=status;
    return error;
};

const NORMALIZE_HEADER=(header)=>header
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'');

const CATEGORY_COLUMN_KEYS=['category','subject','topic','tag','domain','section'];
const QUESTION_COLUMN_KEYS=['question','questiontext','prompt','text','column1','col1','column01'];
const CORRECT_COLUMN_KEYS=[
    'correctoption',
    'correctanswer',
    'correct',
    'answer',
    'correctchoice',
    'column5',
    'column6',
    'column7',
    'column05',
    'column06',
    'column07',
    'col5',
    'col6',
    'col7'
];

const normalizeHeaderRow=(headers)=>{
    if(!Array.isArray(headers)){
        return [];
    }

    const used=new Set();

    return headers.map((header,index)=>{
        const normalized=NORMALIZE_HEADER(header||'');
        let candidate=normalized || `column${index+1}`;

        if(used.has(candidate)){
            let suffix=2;
            while(used.has(`${candidate}_${suffix}`)){
                suffix+=1;
            }
            candidate=`${candidate}_${suffix}`;
        }

        used.add(candidate);
        return candidate;
    });
};

const toNormalizedCellValue=(value)=>{
    if(typeof value==='string'){
        return value.trim();
    }
    if(typeof value==='number' && Number.isFinite(value)){
        return String(value).trim();
    }
    if(value && typeof value.toString==='function'){
        return value.toString().trim();
    }
    return '';
};

const getFirstNonEmptyField=(row,keys)=>{
    for(const key of keys){
        const normalizedValue=toNormalizedCellValue(row[key]);
        if(normalizedValue){
            return {
                key,
                value:normalizedValue
            };
        }
    }
    return {
        key:null,
        value:''
    };
};

const getFirstNonEmptyValue=(row,keys)=>getFirstNonEmptyField(row,keys).value;

const extractOptionValues=(row,excludedKeys=new Set())=>{
    const optionEntries=Object.entries(row)
        .map(([key,value])=>{
            if(excludedKeys.has(key)){
                return null;
            }
            const match=key.match(/^(option|column)(\d+)$/);
            if(!match){
                return null;
            }

            const isColumnKey=match[1]==='column';
            const rawIndex=Number(match[2]);
            if(!Number.isInteger(rawIndex)){
                return null;
            }

            if(isColumnKey && rawIndex<=1){
                return null;
            }

            const trimmed=toNormalizedCellValue(value);
            if(!trimmed){
                return null;
            }

            const normalizedIndex=isColumnKey? rawIndex-1:rawIndex;

            return {
                key,
                rawIndex,
                index:normalizedIndex,
                isColumnKey,
                text:trimmed
            };
        })
        .filter(Boolean);

    const highestColumnIndex=optionEntries.reduce((max,entry)=>{
        if(entry.isColumnKey){
            return Math.max(max,entry.rawIndex);
        }
        return max;
    },0);

    const filteredEntries=optionEntries
        .filter((entry)=>{
            if(entry.isColumnKey && highestColumnIndex>0){
                return entry.rawIndex<highestColumnIndex;
            }
            return true;
        })
        .sort((a,b)=>a.index-b.index);

    return filteredEntries.map((entry)=>entry.text);
};

const canonicalOptionText=(text='')=>text
    .toString()
    .trim()
    .replace(/\s+/g,' ')
    .toLowerCase();

const resolveCorrectOptionIndex=(row,options)=>{
    if(!options.length){
        return null;
    }

    let rawValue=getFirstNonEmptyValue(row,CORRECT_COLUMN_KEYS);

    if(!rawValue){
        const fallbackCandidates=Object.entries(row)
            .map(([key,value])=>{
                const match=key.match(/^column(\d+)$/);
                if(!match){
                    return null;
                }
                const numericIndex=Number(match[1]);
                if(!Number.isInteger(numericIndex)){
                    return null;
                }
                return {
                    numericIndex,
                    value:toNormalizedCellValue(value)
                };
            })
            .filter((entry)=>entry && entry.value)
            .sort((a,b)=>a.numericIndex-b.numericIndex);

        if(fallbackCandidates.length){
            const lastEntry=fallbackCandidates[fallbackCandidates.length-1];
            rawValue=lastEntry?.value || '';
        }
    }

    if(!rawValue){
        return null;
    }

    const valueRaw=rawValue.trim();
    const valueLower=valueRaw.toLowerCase();

    const indexTokenMatch=valueLower.match(/(\d+)/);
    if(indexTokenMatch?.[1]){
        const numericIndex=Number(indexTokenMatch[1]);
        if(Number.isInteger(numericIndex) && numericIndex>=1 && numericIndex<=options.length){
            return numericIndex-1;
        }
    }

    const strippedTokens=valueLower
        .replace(/\b(option|choice|answer|ans|correct|selection|opt|pick|response|resp|index|letter)\b/g,' ')
        .replace(/[^a-z0-9]+/g,' ')
        .trim();

    const alphabet='abcdefghijklmnopqrstuvwxyz';
    const letterToken=(valueLower.match(/\b([a-z])\b/)||[])[1]
        || (strippedTokens.length===1 ? strippedTokens : '');
    if(letterToken && letterToken.length===1){
        const letterIndex=alphabet.indexOf(letterToken);
        if(letterIndex>=0 && letterIndex<options.length){
            return letterIndex;
        }
    }

    const canonicalValue=canonicalOptionText(valueRaw);
    const textMatchIndex=options.findIndex((option)=>canonicalOptionText(option)===canonicalValue);
    if(textMatchIndex>=0){
        return textMatchIndex;
    }

    const strippedNumericMatch=strippedTokens.match(/(\d+)/);
    if(strippedNumericMatch?.[1]){
        const numericIndex=Number(strippedNumericMatch[1]);
        if(Number.isInteger(numericIndex) && numericIndex>=1 && numericIndex<=options.length){
            return numericIndex-1;
        }
    }

    return null;
};

const normalizeQuestionPayload=(body)=>{
    const text=typeof body.text==='string'?body.text.trim():'';
    if(!text){
        throw validationError('Question text is required.');
    }

    const allowedTypes=Question.schema.path('type').enumValues;
    const requestedType=typeof body.type==='string'
        ? body.type.toLowerCase().trim()
        : null;
    const questionType=allowedTypes.includes(requestedType)?requestedType:'mcq';

    const normalizedCategory=typeof body.category==='string'
        ? body.category.trim()
        : '';
    const category=normalizedCategory || Question.schema.path('category')?.defaultValue || 'General';

    let options=[];
    let correctOptionIndex=null;
    let expectedAnswer='';
    let codeSettings=null;

    if(questionType==='mcq'){
        if(!Array.isArray(body.options)){
            throw validationError('Provide answer options for a multiple-choice question.');
        }

        options=body.options
            .map((option)=>{
                if(typeof option==='string'){
                    const trimmed=option.trim();
                    return trimmed?{ text:trimmed }:null;
                }
                if(option && typeof option.text==='string'){
                    const trimmed=option.text.trim();
                    return trimmed?{ text:trimmed }:null;
                }
                return null;
            })
            .filter(Boolean);

        if(options.length<2){
            throw validationError('A multiple-choice question needs at least two answer options.');
        }

        const providedIndex=Number(body.correctOptionIndex);
        if(Number.isNaN(providedIndex) || providedIndex<0 || providedIndex>=options.length){
            throw validationError('Select which option is correct.');
        }
        correctOptionIndex=providedIndex;
    }else if(questionType==='written'){
        expectedAnswer=typeof body.expectedAnswer==='string'
            ? body.expectedAnswer.trim()
            : '';
    }else if(questionType==='code'){
        const codeSettingsInput=(body.codeSettings && typeof body.codeSettings==='object')
            ? body.codeSettings
            : {};

        const languageId=Number(codeSettingsInput.languageId);
        if(!Number.isInteger(languageId) || languageId<=0){
            throw validationError('Select a programming language for this code question.');
        }

        const languageName=typeof codeSettingsInput.languageName==='string'
            ? codeSettingsInput.languageName.trim()
            : '';
        const normalizedLanguageName=languageName || getLanguageLabel(languageId);

        const starterCode=typeof codeSettingsInput.starterCode==='string'
            ? codeSettingsInput.starterCode
            : '';
        const normalizedStarterCode=starterCode && starterCode.trim()
            ? starterCode
            : getDefaultStarterTemplate(languageId);

        const timeLimitRaw=Number(codeSettingsInput.timeLimit);
        const memoryLimitRaw=Number(codeSettingsInput.memoryLimit);

        const timeLimit=Number.isFinite(timeLimitRaw) && timeLimitRaw>0
            ? Math.min(timeLimitRaw,20)
            :5;
        const memoryLimit=Number.isFinite(memoryLimitRaw) && memoryLimitRaw>=64000
            ? Math.min(memoryLimitRaw,512000)
            :128000;

        const rawTestCases=Array.isArray(codeSettingsInput.testCases)
            ? codeSettingsInput.testCases
            : [];

        const normalizedTestCases=rawTestCases
            .map((testCase)=>{
                if(!testCase){
                    return null;
                }
                const input=typeof testCase.input==='string'?testCase.input:'';
                const expectedOutput=typeof testCase.expectedOutput==='string'
                    ? testCase.expectedOutput
                    : '';
                if(!expectedOutput.trim()){
                    return null;
                }
                return {
                    input,
                    expectedOutput,
                    isPublic:Boolean(testCase.isPublic)
                };
            })
            .filter(Boolean);

        if(!normalizedTestCases.length){
            throw validationError('Provide at least one test case with an expected output.');
        }

        codeSettings={
            languageId,
            languageName:normalizedLanguageName,
            starterCode:normalizedStarterCode,
            timeLimit,
            memoryLimit,
            testCases:normalizedTestCases
        };
    }

    if(questionType!=='mcq'){
        options=[];
        correctOptionIndex=null;
    }

    if(questionType!=='written'){
        expectedAnswer='';
    }

    if(questionType!=='code'){
        codeSettings=null;
    }

    return {
        text,
        type:questionType,
        category,
        options,
        correctOptionIndex,
        expectedAnswer,
        codeSettings
    };
};

const listByExam=asyncHandler(async (req,res)=>{
    const { examId }=req.params;
    const questions=await Question.find({ exam:examId }).sort('createdAt');
    res.json(questions);
});

const createQuestion=asyncHandler(async (req,res)=>{
    const { examId }=req.params;
    let normalized;
    try{
        normalized=normalizeQuestionPayload(req.body);
    }catch(error){
        const status=error.status || 400;
        return res.status(status).json({ message:error.message });
    }

    const exam=await Exam.findById(examId);

    if(!exam){
        return res.status(404).json({ message:'Exam not found.' });
    }

    if(!exam.createdBy.equals(req.user._id) && req.user.role!=='admin'){
        return res.status(403).json({ message:'You cannot add questions to this exam.' });
    }

    const question=await Question.create({
        exam:examId,
        ...normalized
    });

    exam.questions.push(question._id);
    await exam.save();

    res.status(201).json(question.toObject());
});

const updateQuestion=asyncHandler(async (req,res)=>{
    const { examId, questionId }=req.params;

    const exam=await Exam.findById(examId);
    if(!exam){
        return res.status(404).json({ message:'Exam not found.' });
    }

    if(!exam.createdBy.equals(req.user._id) && req.user.role!=='admin'){
        return res.status(403).json({ message:'You cannot modify questions on this exam.' });
    }

    const question=await Question.findOne({ _id:questionId, exam:examId });
    if(!question){
        return res.status(404).json({ message:'Question not found.' });
    }

    let normalized;
    try{
        normalized=normalizeQuestionPayload(req.body);
    }catch(error){
        const status=error.status || 400;
        return res.status(status).json({ message:error.message });
    }

    question.text=normalized.text;
    question.type=normalized.type;
    question.category=normalized.category;
    question.options=normalized.options;
    question.correctOptionIndex=normalized.correctOptionIndex;
    question.expectedAnswer=normalized.expectedAnswer;
    question.codeSettings=normalized.codeSettings;

    await question.save();

    res.json(question.toObject());
});

const removeQuestion=asyncHandler(async (req,res)=>{
    const { examId, questionId }=req.params;

    const exam=await Exam.findById(examId);

    if(!exam){
        return res.status(404).json({ message:'Exam not found.' });
    }

    if(!exam.createdBy.equals(req.user._id) && req.user.role!=='admin'){
        return res.status(403).json({ message:'You cannot remove questions from this exam.' });
    }

    await Question.deleteOne({ _id:questionId, exam:examId });
    exam.questions=exam.questions.filter((id)=>id.toString()!==questionId);
    await exam.save();

    res.status(204).end();
});

const importMcqQuestionsFromCsv=asyncHandler(async (req,res)=>{
    const { examId }=req.params;

    if(!req.file || !req.file.buffer){
        return res.status(400).json({ message:'Upload a CSV file named "file" containing your questions.' });
    }

    const exam=await Exam.findById(examId);

    if(!exam){
        return res.status(404).json({ message:'Exam not found.' });
    }

    if(!exam.createdBy.equals(req.user._id) && req.user.role!=='admin'){
        return res.status(403).json({ message:'You cannot import questions for this exam.' });
    }

    let records;
    let hadHeader=false;
    try{
        const rows=parse(req.file.buffer.toString('utf8'),{
            bom:true,
            skip_empty_lines:true,
            trim:true,
            relax_column_count:true,
            relax_quotes:true
        });

        if(!Array.isArray(rows) || !rows.length){
            records=[];
        }else{
            const candidateHeader=normalizeHeaderRow(rows[0]);
            const columnCount=rows.reduce((max,row)=>Math.max(max,Array.isArray(row)?row.length:0),0);

            const looksLikeHeader=candidateHeader.some((name)=>
                QUESTION_COLUMN_KEYS.includes(name)
                || CATEGORY_COLUMN_KEYS.includes(name)
                || /^option\d+$/.test(name)
                || CORRECT_COLUMN_KEYS.includes(name)
            );

            hadHeader=looksLikeHeader;

            const header=looksLikeHeader
                ? candidateHeader
                : normalizeHeaderRow(Array.from({ length:columnCount },(_unused,index)=>`column${index+1}`));

            const dataRows=looksLikeHeader? rows.slice(1):rows;

            records=dataRows.map((row)=>{
                const record={};
                header.forEach((columnName,columnIndex)=>{
                    const cell=Array.isArray(row)?row[columnIndex]:undefined;
                    record[columnName]=typeof cell==='string'?cell.trim():cell ?? '';
                });
                return record;
            });
        }
    }catch(error){
        console.error('Failed to parse uploaded CSV',error);
        const description=error?.message ? ` ${error.message}`:'';
        return res.status(400).json({ message:`Unable to read CSV file.${description}`.trim() });
    }

    if(!Array.isArray(records) || !records.length){
        return res.status(400).json({ message:'CSV file does not contain any question rows.' });
    }

    const defaultCategoryValue=Question.schema.path('category')?.defaultValue || 'General';
    const preparedQuestions=[];
    const issues=[];

    records.forEach((row,index)=>{
        const rowNumber=index+(hadHeader?2:1);
        const excludedOptionKeys=new Set();
        const questionRow={ ...row };

        const categoryField=getFirstNonEmptyField(row,CATEGORY_COLUMN_KEYS);
        let categoryValue=categoryField.value;
        if(categoryField.key){
            questionRow[categoryField.key]='';
            excludedOptionKeys.add(categoryField.key);
        }

        let questionText='';
        let questionKey=null;
        let options=null;
        let correctIndex=null;

        // Attempt to interpret as Category, Question, Option1... layout when no explicit category column header is found.
        if(!categoryField.key){
            const fallbackCategoryKeys=['column1','col1','column01'];
            const fallbackQuestionKeys=['column2','col2','column02'];
            const candidateCategoryKey=fallbackCategoryKeys.find((key)=>typeof row[key]==='string' && row[key].trim());
            const candidateQuestionKey=fallbackQuestionKeys.find((key)=>typeof row[key]==='string' && row[key].trim());

            if(candidateCategoryKey && candidateQuestionKey){
                const candidateCategoryValue=row[candidateCategoryKey].trim();
                const candidateQuestionValue=row[candidateQuestionKey].trim();
                const fallbackExcluded=new Set([...fallbackCategoryKeys,...fallbackQuestionKeys]);
                const candidateOptions=extractOptionValues(row,fallbackExcluded);
                const candidateCorrectIndex=resolveCorrectOptionIndex(row,candidateOptions);

                const looksLikeCategory=candidateCategoryValue
                    && candidateCategoryValue.length<=80
                    && !/[?]/.test(candidateCategoryValue);
                const looksLikeQuestion=candidateQuestionValue
                    && (candidateQuestionValue.length>=10 || /[?]/.test(candidateQuestionValue));

                if(looksLikeCategory && looksLikeQuestion && candidateOptions.length>=2 && candidateCorrectIndex!==null){
                    categoryValue=candidateCategoryValue;
                    questionText=candidateQuestionValue;
                    questionKey=candidateQuestionKey;
                    options=candidateOptions;
                    correctIndex=candidateCorrectIndex;
                    fallbackExcluded.forEach((key)=>excludedOptionKeys.add(key));
                }
            }
        }

        if(!questionText){
            const questionField=getFirstNonEmptyField(questionRow,QUESTION_COLUMN_KEYS);
            questionText=questionField.value;
            questionKey=questionField.key;
        }

        if(!questionText){
            issues.push(`Row ${rowNumber}: Question text is required.`);
            return;
        }

        if(questionKey){
            excludedOptionKeys.add(questionKey);
        }

        if(!options){
            options=extractOptionValues(row,excludedOptionKeys);
        }

        if(options.length<2){
            issues.push(`Row ${rowNumber}: Provide at least two answer options.`);
            return;
        }

        if(options.length>8){
            issues.push(`Row ${rowNumber}: Limit to eight answer options.`);
            return;
        }

        if(correctIndex===null){
            correctIndex=resolveCorrectOptionIndex(row,options);
        }

        if(correctIndex===null){
            issues.push(`Row ${rowNumber}: "Correct Option" must be 1-${options.length}, a letter (A, B, …) or match an option text.`);
            return;
        }

        preparedQuestions.push({
            exam:examId,
            text:questionText,
            type:'mcq',
            options:options.map((optionText)=>({ text:optionText })),
            correctOptionIndex:correctIndex,
            category:categoryValue || defaultCategoryValue,
            meta:{
                normalizedText:questionText.trim().toLowerCase(),
                rowNumber
            }
        });
    });

    if(!preparedQuestions.length){
        const fallbackMessage=issues.length?
            `Unable to import questions. ${issues.join(' ')}`:
            'CSV file does not contain any valid question rows.';
        return res.status(400).json({ message:fallbackMessage });
    }

    const existingQuestions=await Question.find({ exam:examId });
    const existingByNormalizedText=new Map();
    existingQuestions.forEach((question)=>{
        const key=(question.text||'').trim().toLowerCase();
        if(key && !existingByNormalizedText.has(key)){
            existingByNormalizedText.set(key,question);
        }
    });

    const questionsToInsert=[];
    const questionsToUpdate=[];

    preparedQuestions.forEach((prepared)=>{
        const { meta,...questionData }=prepared;
        const normalizedText=(meta?.normalizedText || questionData.text || '').trim().toLowerCase();
        const serializedOptions=Array.isArray(questionData.options)
            ? questionData.options.map((option)=>canonicalOptionText(option.text||option))
            : [];
        const existing=normalizedText? existingByNormalizedText.get(normalizedText):null;

        if(existing){
            const existingOptions=Array.isArray(existing.options)
                ? existing.options.map((option)=>canonicalOptionText(option.text||option))
                : [];
            const optionsChanged=serializedOptions.length!==existingOptions.length
                || serializedOptions.some((option,idx)=>option!==existingOptions[idx]);
            const indexChanged=existing.correctOptionIndex!==questionData.correctOptionIndex;
            const categoryChanged=(existing.category||'').trim()!==(questionData.category||'').trim();

            if(optionsChanged || indexChanged || categoryChanged){
                questionsToUpdate.push({ existing, data:{ ...questionData, meta } });
            }
        }else{
            questionsToInsert.push(questionData);
        }
    });

    let insertedQuestions=[];
    if(questionsToInsert.length){
        insertedQuestions=await Question.insertMany(questionsToInsert,{ ordered:true });
        exam.questions.push(...insertedQuestions.map((question)=>question._id));
        await exam.save();
    }

    const updatedQuestions=[];
    if(questionsToUpdate.length){
        for(const { existing, data } of questionsToUpdate){
            existing.text=data.text;
            existing.type=data.type;
            existing.options=data.options;
            existing.correctOptionIndex=data.correctOptionIndex;
            existing.category=data.category;
            updatedQuestions.push(await existing.save());
        }
    }

    const serializedInserted=insertedQuestions.map((question)=>question.toObject());
    const serializedUpdated=updatedQuestions.map((question)=>question.toObject());

    const importedCount=serializedInserted.length;
    const updatedCount=serializedUpdated.length;
    const skippedCount=issues.length;

    let message=`Imported ${importedCount} question${importedCount===1?'':'s'} successfully.`;
    if(updatedCount){
        message+=` Updated ${updatedCount} existing question${updatedCount===1?'':'s'}.`;
    }
    if(skippedCount){
        const issueSummary=issues.slice(0,3).join(' ');
        const moreIssues=skippedCount>3?` (and ${skippedCount-3} more issue${skippedCount-3===1?'':'s'}).`:'';
        message+=` Skipped ${skippedCount} row${skippedCount===1?'':'s'}: ${issueSummary}${moreIssues}`;
    }

    await repairQuestionCorrectOptions({ examIds:[examId] });

    res.status(201).json({
        message,
        questions:[...serializedInserted,...serializedUpdated],
        imported:importedCount,
        updated:updatedCount,
        skipped:skippedCount,
        issues
    });
});

module.exports={
    listByExam,
    createQuestion,
    updateQuestion,
    removeQuestion,
    importMcqQuestionsFromCsv
};
