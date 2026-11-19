const copy=require('../i18n/flight.json');
exports.forLanguage=language=>{
  const t=(key,values={})=>{
    let value=String(key).split('.').reduce((node,part)=>node?.[part],copy[language]);
    if(typeof value!=='string')value=typeof values==='string'?values:values.defaultValue??key;
    return value.replace(/\{\{(\w+)\}\}/g,(match,name)=>values[name]===undefined?match:String(values[name]));
  };
  return {t,i18n:{language,resolvedLanguage:language}};
};
exports.module=language=>({useTranslation:()=>exports.forLanguage(language)});
