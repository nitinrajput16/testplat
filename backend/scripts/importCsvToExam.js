#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Exam = require('../src/models/Exam');
const questionController = require('../src/controllers/questionController');

function parseArgs() {
    const args = process.argv.slice(2);
    const result = {};

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if ((arg === '--exam' || arg === '-e') && i + 1 < args.length) {
            result.examId = args[i + 1];
            i += 1;
        } else if ((arg === '--file' || arg === '-f') && i + 1 < args.length) {
            result.filePath = args[i + 1];
            i += 1;
        } else if (arg === '--help' || arg === '-h') {
            result.help = true;
        }
    }

    return result;
}

function printUsage() {
    console.log('Usage: node scripts/importCsvToExam.js --exam <examId> --file <path/to/questions.csv>');
    console.log('Imports MCQ questions from the provided CSV using the same logic as the dashboard upload.');
}

async function main() {
    const { examId, filePath, help } = parseArgs();

    if (help) {
        printUsage();
        process.exit(0);
    }

    if (!examId || !filePath) {
        console.error('Missing required arguments.');
        printUsage();
        process.exit(1);
    }

    const absoluteFilePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absoluteFilePath)) {
        console.error(`CSV file not found at ${absoluteFilePath}`);
        process.exit(1);
    }

    const buffer = fs.readFileSync(absoluteFilePath);

    await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000
    });

    const exam = await Exam.findById(examId);

    if (!exam) {
        console.error(`Exam with id ${examId} was not found.`);
        await mongoose.disconnect();
        process.exit(1);
    }

    const mockRequest = {
        params: { examId },
        file: { buffer },
        user: {
            _id: exam.createdBy,
            role: 'admin'
        }
    };

    const result = await new Promise((resolve, reject) => {
        const response = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                resolve({ status: this.statusCode || 200, payload });
            },
            end() {
                resolve({ status: this.statusCode || 204, payload: null });
            }
        };

        questionController.importMcqQuestionsFromCsv(mockRequest, response, reject);
    });

    console.log(`Import completed with status ${result.status}`);
    if (result.payload) {
        console.log(JSON.stringify(result.payload, null, 2));
    }

    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error('Import failed:', error);
    try {
        await mongoose.disconnect();
    } catch (disconnectError) {
        // ignore
    }
    process.exit(1);
});
