(function(window){
    const DEFAULT_BASE_URL='https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min';
    let loadPromise=null;
    let configured=false;

    function getBaseUrl(){
        const base=window.MONACO_BASE_URL||DEFAULT_BASE_URL;
        return base.endsWith('/vs')?base.replace(/\/vs$/,''):base;
    }

    function ensureRequireConfigured(){
        if(configured){
            return Promise.resolve();
        }

        const base=getBaseUrl();

        return new Promise((resolve,reject)=>{
            const start=Date.now();

            function attempt(){
                if(typeof require==='undefined'){
                    if(Date.now()-start>5000){
                        reject(new Error('Monaco AMD loader did not initialise.'));
                        return;
                    }
                    setTimeout(attempt,25);
                    return;
                }

                try{
                    require.config({ paths:{ vs:`${base}/vs` } });
                    configured=true;
                    resolve();
                }catch(error){
                    reject(error);
                }
            }

            attempt();
        });
    }

    function ensureMonaco(){
        if(window.monaco){
            return Promise.resolve(window.monaco);
        }
        if(loadPromise){
            return loadPromise;
        }

        loadPromise=ensureRequireConfigured().then(()=>new Promise((resolve,reject)=>{
            require(['vs/editor/editor.main'],()=>{
                resolve(window.monaco);
            },(error)=>{
                configured=false;
                loadPromise=null;
                reject(error);
            });
        }));

        return loadPromise;
    }

    async function createEditor(container,options={}){
        if(!container){
            throw new Error('Monaco container element is required.');
        }
        const monaco=await ensureMonaco();
        const {
            value='',
            language='javascript',
            theme='vs-dark',
            readOnly=false,
            fontSize=14,
            automaticLayout=true,
            minimap=false,
            editorOptions={}
        }=options;

        return monaco.editor.create(container,{
            value,
            language,
            theme,
            readOnly,
            fontSize,
            automaticLayout,
            minimap:{ enabled:minimap },
            scrollBeyondLastLine:false,
            renderWhitespace:'selection',
            ...editorOptions
        });
    }

    function updateLanguage(editor,language){
        if(!editor || !language){
            return;
        }
        ensureMonaco().then((monaco)=>{
            const model=editor.getModel();
            if(model){
                monaco.editor.setModelLanguage(model,language);
            }
        }).catch((error)=>{
            console.warn('Failed to update editor language',error);
        });
    }

    function disposeEditor(editor){
        if(editor && typeof editor.dispose==='function'){
            editor.dispose();
        }
    }

    window.MonacoHelper={
        ensureMonaco,
        createEditor,
        updateLanguage,
        disposeEditor
    };
})(window);
