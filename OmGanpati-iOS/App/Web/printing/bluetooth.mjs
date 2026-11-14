export const profiles=[];
const native=(op,args={})=>window.webkit.messageHandlers.printer.postMessage({op,...args});
export class BluetoothPrinter {
 constructor(_,changed=()=>{}){this.changed=changed;this.devices=new Map();this.device=null;this.connected=false;this.busy=false;this.connecting=false;this.generation=0;window.addEventListener('native-printer-disconnected',()=>{this.connected=false;this.changed('disconnected');});}
 get supported(){return !!window.webkit?.messageHandlers?.printer;}
 async remembered(){this.changed();}
 async choose(){const d=await native('choose');this.devices.set(d.id,d);await this.connect(d.id);return d;}
 async connect(id){this.connecting=true;this.changed();try{await native('connect',{id});this.device=this.devices.get(id);this.connected=true;}finally{this.connecting=false;this.changed();}}
 disconnect(){this.generation++;this.connected=false;native('disconnect').catch(()=>{});this.changed('disconnected');}
 async send(data,progress=()=>{}){if(!this.connected||this.busy)throw Error('Connect the printer and wait for the current print.');this.busy=true;this.changed();const generation=this.generation;try{for(let i=0;i<data.length;i+=20){if(!this.connected||generation!==this.generation)throw Error('Print cancelled');await native('write',{bytes:Array.from(data.slice(i,i+20))});progress(Math.min(100,Math.round((i+20)*100/data.length)));await new Promise(r=>setTimeout(r,20));}}catch(e){this.disconnect();throw Error(String(e)+' Check the label before retrying.');}finally{this.busy=false;this.changed();}}
}
