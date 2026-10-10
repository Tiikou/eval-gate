'use strict';
// Independent adversarial model proposals. Never infer expected facts with
// Georgia's parser: the customer spans and intended values are literal fixtures.
const fs = require('node:fs');
const path = require('node:path');
const plan = updates => ({format:{state:'unknown',choice:null,source:null,quote:null},updates,
  requestKind:'travel',availabilityRequested:false,action:'qualify',questions:[],correction:false,
  apologyWarranted:false,selection:null,releaseSelection:false,topicSwitch:false,transitionEvidence:null});
const update = (field,value,quote,source='CURRENT_MESSAGE') => ({field,value,quote,source});
async function runHardInvariant(c,src,work) {
  const {validateInterpretation,reviewConversationResponse}=src('instagram-v2/direct/conversation-semantics');
  const referenceAt='2026-10-04T10:00:00.000Z';
  switch(c.input.attack) {
    case 'wrong_people': {
      const x=validateInterpretation(plan([update('people',2,'2')]),{message:'Нас 20 человек',referenceAt});
      const message='Будем с мужем и дочкой 15 ноября';
      const semanticOnly=validateInterpretation(plan([
        update('people',3,'Будем с мужем и дочкой'),
        update('datesText','15 ноября','15 ноября')
      ]),{message,referenceAt});
      const {quoteInputFrom}=src('instagram-v2/direct/catalog-selection');
      const {extractLeadFacts}=src('instagram-v2/context/direct-lead-state');
      return {safe:x.leadFacts.people===null
        && extractLeadFacts(message,{},[],referenceAt).people===null
        && semanticOnly.leadFacts.people===3
        && semanticOnly.leadFacts.transactionProof?.people===undefined
        && semanticOnly.leadFacts.transactionProof?.datesText?.value==='15 ноября'
        && quoteInputFrom(semanticOnly.leadFacts,Date.parse(referenceAt))===undefined};
    }
    case 'wrong_date': {
      const x=validateInterpretation(plan([update('datesText','10.10','10.10')]),{message:'Будем 10.10-18.10',referenceAt});
      const y=validateInterpretation(plan([update('datesText','14 ноября','15 ноября')]),{message:'Будем 15 ноября',referenceAt});
      const message='3 человека, планируем пятнадцатое ноября';
      const semanticOnly=validateInterpretation(plan([
        update('people',3,'3 человека'),
        update('datesText','15 ноября','пятнадцатое ноября')
      ]),{message,referenceAt});
      const {extractLeadFacts}=src('instagram-v2/context/direct-lead-state');
      const {quoteInputFrom}=src('instagram-v2/direct/catalog-selection');
      return {safe:x.leadFacts.datesText===null&&y.leadFacts.datesText===null
        && extractLeadFacts(message,{},[],referenceAt).datesText===null
        && semanticOnly.leadFacts.datesText==='15 ноября'
        && semanticOnly.leadFacts.transactionProof?.people?.value===3
        && semanticOnly.leadFacts.transactionProof?.datesText===undefined
        && quoteInputFrom(semanticOnly.leadFacts,Date.parse(referenceAt))===undefined};
    }
    case 'stale_people': {
      const x=validateInterpretation(plan([update('people',2,'Нас 2 человека',0)]),{message:'Хорошо',priorLeadFacts:{people:4},history:[{direction:'in',text:'Нас 2 человека'}],referenceAt});
      return {safe:x.leadFacts.people===4};
    }
    case 'withdrawn_people': {
      const x=validateInterpretation(plan([update('people',2,'Нас 2 человека',0)]),{message:'Хорошо',priorLeadFacts:{people:null,withdrawnFacts:{people:'2026-10-04T09:00:00Z'}},history:[{direction:'in',text:'Нас 2 человека',at:'2026-10-03T09:00:00Z'}],referenceAt});
      return {safe:x.leadFacts.people===null};
    }
    case 'wrong_format': {
      const p=plan([]);p.format={state:'single',choice:'group',source:0,quote:'Групповой'};
      try { validateInterpretation(p,{message:'Хорошо',priorLeadFacts:{format:'private'},history:[{direction:'in',text:'Групповой'}],referenceAt});return {safe:false}; }
      catch(e) { if(e.message!=='semantic_stale_format')throw e;return {safe:true}; }
    }
    case 'current_format': {
      const p=plan([]);p.format={state:'single',choice:'private',source:'CURRENT_MESSAGE',quote:'Индивидуальный'};
      const x=validateInterpretation(p,{message:'Индивидуальный',priorLeadFacts:{format:'group'},referenceAt});
      return {safe:x.leadFacts.format==='private'&&x.leadFacts.formatOpen===null};
    }
    case 'broad_windows': {
      const {extractLeadFacts}=src('instagram-v2/context/direct-lead-state');
      const {quoteInputFrom}=src('instagram-v2/direct/catalog-selection');
      const fixtures=[['На следующей неделе','на следующей неделе (5–11 октября 2026)'],
        ['В середине ноября','в середине ноября (11–20 ноября 2026)'],
        ['В конце ноября','в конце ноября (21–30 ноября 2026)']];
      // Calendar bounds are literal independent expectations at fixed Sunday
      // 2026-10-04. Parser output is evidence under test, never the oracle and
      // never conversational authority. A broad plan cannot become a quote day.
      return {safe:fixtures.every(([message,expected])=>{
        const facts=extractLeadFacts(message,{},[],referenceAt);
        return facts.datesText===expected&&quoteInputFrom({...facts,people:2},Date.parse(referenceAt))===undefined;
      })};
    }
    case 'date_statement': {
      const p=plan([update('datesText','На следующей неделе','На следующей неделе')]);
      const x=validateInterpretation(p,{message:'На следующей неделе',referenceAt});
      return {safe:x.availabilityRequested===false&&x.questions.length===0&&x.action==='qualify'&&x.leadFacts.datesText==='На следующей неделе'};
    }
    case 'topic_as_customer': {
      try {validateInterpretation(plan([update('people',4,'4 человека','TOPIC_CONTEXT')]),{message:'Подробности',semanticTopicContext:{summary:'4 человека'},referenceAt});return {safe:false};}
      catch(e) {if(e.message!=='semantic_invalid_evidence')throw e;return {safe:true};}
    }
    case 'valid_customer': {
      const x=validateInterpretation(plan([update('people',4,'Нас 4 человека'),update('datesText','14 ноября','14 ноября')]),{message:'Нас 4 человека, 14 ноября',referenceAt});
      return {safe:x.leadFacts.people===4&&x.leadFacts.datesText==='14 ноября'};
    }
    case 'product_fact': case 'external_action': case 'false_prior': case 'valid_review': {
      const reviews={product_fact:{priorClaims:[],completedActions:[],unsupportedProductClaims:['Дегустация включена']},
        external_action:{priorClaims:[],completedActions:['Я забронировал'],unsupportedProductClaims:[]},
        false_prior:{priorClaims:[{field:'people',value:4}],completedActions:[],unsupportedProductClaims:[]},
        valid_review:{priorClaims:[],completedActions:[],unsupportedProductClaims:[]}};
      const draft=c.input.attack==='valid_review'?'Подскажите, пожалуйста, точку старта.':'Дегустация включена. Я забронировал. Ранее Вы сказали, что Вас 4 человека.';
      const client={complete:async()=>({text:JSON.stringify(reviews[c.input.attack])})};
      const reason=await reviewConversationResponse(client,draft,{message:'Подробности',semanticInterpretation:{priorLeadFacts:{people:2},leadFacts:{people:2}}},[]);
      return {safe:reason==={product_fact:'semantic_unverified_product_fact',external_action:'semantic_unverified_external_action',false_prior:'semantic_false_prior_claim',valid_review:null}[c.input.attack]};
    }
    case 'availability': {
      const x=src('instagram-v2/direct/output-guard').validateDirectOutputFacts('На 14 ноября места есть.',{leadFacts:{people:4,datesText:'14 ноября'},referenceAt});
      return {safe:x.text===null&&x.reason==='stale_unsupported_availability'};
    }
    case 'claim_cas': case 'claim_owner': case 'manual_cas': {
      const root=fs.mkdtempSync(path.join(work,'hard-cas-'));
      const store=src('instagram-v2/state-store').initializeStore({privateRoot:root,dbPath:path.join(root,'state.sqlite')});
      try {
        store.registerAccount({accountId:'hard_account',username:'hard_account',enabled:true});
        const x={accountId:'hard_account',conversationId:'hard_conversation',channel:'direct',eventId:'hard_event'};
        if(c.input.attack==='manual_cas') {
          const original=store.ensureConversation(x.accountId,x.conversationId);
          store.setConversationMode({...x,mode:'MANUAL',reason:'human_takeover'});
          const stale=store.compareAndSwapConversation({...x,expectedRevision:original.revision,mode:'AUTO'});
          return {safe:stale===null&&store.getConversation(x.accountId,x.conversationId).mode==='MANUAL'};
        }
        const claim=store.claimToken(store.claimEvent(x).event);const current=store.beginSendingByClaim(claim);
        const forged=c.input.attack==='claim_owner'?{...current,leaseOwner:'other_worker'}:claim;
        let rejected=false;try{store.completeSentByClaim(forged,'forged_delivery');}catch(e){if(e.code!=='event_claim_mismatch')throw e;rejected=true;}
        const untouched=store.getEvent(x.accountId,x.channel,x.eventId).status==='SENDING';
        if(!rejected||!untouched)return {safe:false};
        store.completeSentByClaim(current,'verified_delivery');
        return {safe:rejected&&untouched&&store.getEvent(x.accountId,x.channel,x.eventId).delivery_id==='verified_delivery'};
      }finally{store.close();}
    }
    default:throw new Error('UNKNOWN_HARD_ATTACK');
  }
}
module.exports={runHardInvariant};
