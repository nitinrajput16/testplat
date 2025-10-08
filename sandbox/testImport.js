function normalizeHeaderRow(headers){
	if(!Array.isArray(headers)){
		return [];
	}
	const used=new Set();
	return headers.map((header,index)=>{
		const normalized=String(header||'')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g,'');
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
}

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

const getFirstNonEmptyValue=(row,keys)=>{
	for(const key of keys){
		const normalized=toNormalizedCellValue(row[key]);
		if(normalized){
			return normalized;
		}
	}
	return '';
};

const canonicalOptionText=(text='')=>text
	.toString()
	.trim()
	.replace(/\s+/g,' ')
	.toLowerCase();

const extractOptionValues=(row)=>{
	return Object.entries(row)
		.map(([key,value])=>{
			const match=key.match(/^(option|column)(\d+)$/);
			if(!match){
				return null;
			}
			const rawIndex=Number(match[2]);
			if(!Number.isInteger(rawIndex)){
				return null;
			}
			const text=toNormalizedCellValue(value);
			if(!text){
				return null;
			}
			return {
				key,
				index:match[1]==='column'?rawIndex-1:rawIndex,
				text
			};
		})
		.filter(Boolean)
		.sort((a,b)=>a.index-b.index)
		.map((entry)=>entry.text);
};

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

	const numericToken=(valueLower.match(/(\d+)/)||[])[1];
	if(numericToken){
		const numericIndex=Number(numericToken);
		if(Number.isInteger(numericIndex) && numericIndex>=1 && numericIndex<=options.length){
			return numericIndex-1;
		}
	}

	const strippedTokens=valueLower
		.replace(/\b(option|choice|answer|ans|correct|selection|opt|pick|response|resp|index|letter)\b/g,' ')
		.replace(/[^a-z0-9]+/g,' ')
		.trim();

	const secondaryNumeric=(strippedTokens.match(/(\d+)/)||[])[1];
	if(secondaryNumeric){
		const numericIndex=Number(secondaryNumeric);
		if(Number.isInteger(numericIndex) && numericIndex>=1 && numericIndex<=options.length){
			return numericIndex-1;
		}
	}

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

	return null;
};

let parse;
try{
	({ parse }=require('csv-parse/sync'));
}catch(error){
	try{
		({ parse }=require('../backend/node_modules/csv-parse/sync'));
	}catch(innerError){
		console.warn('csv-parse not installed. Skipping CSV diagnostics. Using manual sample.');
	}
}


if(parse){
	const csvContent=require('fs').readFileSync(require('path').join(__dirname,'sample.csv'),'utf8');
	const rows=parse(csvContent,{
		bom:true,
		skip_empty_lines:true,
		trim:true,
		relax_column_count:true,
		relax_quotes:true
	});

	const headerRowCandidate=rows[0];
	const candidateNormalized=normalizeHeaderRow(headerRowCandidate);
	const looksLikeHeader=candidateNormalized.some((value)=>[
		'category','subject','topic','tag','domain','section',
		'question','questiontext','prompt','text',
		'correctoption','correctanswer','correct','answer'
	].includes(value));

	const headerNames=looksLikeHeader
		? candidateNormalized
		: normalizeHeaderRow(Array.from({ length:headerRowCandidate.length },(_unused,index)=>`column${index+1}`));
	const dataRows=looksLikeHeader? rows.slice(1):rows;

	const results=dataRows.map((row,rowIndex)=>{
		const record={};
		headerNames.forEach((columnName,index)=>{
			record[columnName]=row?.[index];
		});

		const options=extractOptionValues(record);
		const correctIndex=resolveCorrectOptionIndex(record,options);

		return {
			row:rowIndex+1,
			record,
			options,
			correctIndex,
			correctOption:typeof correctIndex==='number'?options[correctIndex]:null
		};
	});

	console.log('CSV sample results',results);
}else{
	const sampleRows=[
		{
			category:'DBMS',
			question:'Which of the following is not a SQL command?',
			option1:'SELECT',
			option2:'INSERT',
			option3:'UPDATE',
			option4:'CONNECT',
			correctoption:4
		},
		{
			category:'OOPS',
			question:'What does OOP stand for?',
			option1:'Object Oriented Programming',
			option2:'Open Online Programming',
			option3:'Optimal Object Protocol',
			option4:'Ordered Operation Process',
			correctoption:1
		},
		{
			category:'CN',
			question:'Which device is used to connect a computer to a network?',
			option1:'Monitor',
			option2:'Router',
			option3:'Keyboard',
			option4:'Printer',
			correctoption:2
		}
	];

	const results=sampleRows.map((row,index)=>{
		const options=extractOptionValues(row);
		const correctIndex=resolveCorrectOptionIndex(row,options);
		return {
			row:index+1,
			options,
			correctIndex,
			correctOption:typeof correctIndex==='number'?options[correctIndex]:null
		};
	});

	console.log('Manual sample results',results);
}

