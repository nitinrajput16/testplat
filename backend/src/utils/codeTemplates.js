const FALLBACK_LANGUAGE_ID=63;

const LANGUAGE_CATALOG={
    63:{
        label:'JavaScript (Node)',
        template:'function solve() {\n    // Write your code here\n}\n\nsolve();\n'
    },
    71:{
        label:'Python (3.11)',
        template:'def solve():\n    # Write your code here\n    pass\n\nif __name__ == "__main__":\n    solve()\n'
    },
    54:{
        label:'C++ (GCC 13)',
        template:'#include <bits/stdc++.h>\nusing namespace std;\n\nint main(){\n        // Write your code here\n    return 0;\n}\n'
    },
    62:{
        label:'Java (JDK 17)',
        template:'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        // Write your code here\n    }\n}\n'
    },
    50:{
        label:'C (GCC 13)',
        template:'#include <stdio.h>\n\nint main(void) {\n    // Write your code here\n    return 0;\n}\n'
    },
    73:{
        label:'Rust',
        template:'fn main() {\n    // Write your code here\n}\n'
    },
    78:{
        label:'Kotlin',
        template:'fun main() {\n    // Write your code here\n}\n'
    },
    51:{
        label:'C#',
        template:'using System;\n\npublic class Program {\n    public static void Main() {\n        // Write your code here\n    }\n}\n'
    },
    68:{
        label:'PHP',
        template:'<?php\n// Write your code here\n'
    },
    74:{
        label:'TypeScript',
        template:'// Write your solution here\nfunction solve(): void {\n    // ...\n}\n\nsolve();\n'
    },
    80:{
        label:'R',
        template:'# Write your R code here\n'
    },
    82:{
        label:'SQL',
        template:'-- Write your SQL query here\n'
    },
    72:{
        label:'Ruby',
        template:'# Write your Ruby solution here\n'
    }
};

function getLanguageCatalogEntry(languageId){
    const numericId=Number(languageId);
    if(!Number.isInteger(numericId)){
        return null;
    }
    return LANGUAGE_CATALOG[numericId] || null;
}

function getDefaultStarterTemplate(languageId){
    const entry=getLanguageCatalogEntry(languageId);
    if(entry){
        return entry.template;
    }
    return LANGUAGE_CATALOG[FALLBACK_LANGUAGE_ID].template;
}

function getLanguageLabel(languageId,fallback=''){ // eslint-disable-line default-param-last
    const entry=getLanguageCatalogEntry(languageId);
    if(entry && entry.label){
        return entry.label;
    }
    if(fallback){
        return fallback;
    }
    if(typeof languageId!=='undefined' && languageId!==null){
        return `Language ${languageId}`;
    }
    return 'Programming language';
}

module.exports={
    getDefaultStarterTemplate,
    getLanguageLabel
};
