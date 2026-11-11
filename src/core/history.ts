import type {Project} from './types';
export class ProjectHistory {
  past: Project[]=[]; future: Project[]=[];
  push(p:Project) {this.past.push(p);if(this.past.length>30)this.past.shift();this.future=[];}
  undo(p:Project) {const prev=this.past.pop();if(prev)this.future.push(p);return prev;}
  redo(p:Project) {const next=this.future.pop();if(next)this.past.push(p);return next;}
  clear(){this.past=[];this.future=[];}
}
