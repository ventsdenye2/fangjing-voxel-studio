import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';

/** Keep DOM size bounded while the complete scene remains editable. */
export default function VirtualList<T extends {id:string}>({items,itemHeight,className,activeId,renderItem}:{items:T[];itemHeight:number;className:string;activeId?:string;renderItem:(item:T)=>ReactNode}){
  const host=useRef<HTMLDivElement>(null),[top,setTop]=useState(0),[height,setHeight]=useState(300);
  useLayoutEffect(()=>{
    const el=host.current!;const observer=new ResizeObserver(()=>setHeight(el.clientHeight));
    observer.observe(el);setHeight(el.clientHeight);return()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{
    const el=host.current!;const maximum=Math.max(0,items.length*itemHeight-el.clientHeight);
    if(el.scrollTop>maximum){el.scrollTop=maximum;setTop(maximum);}
  },[items.length,itemHeight]);
  useLayoutEffect(()=>{
    if(!activeId)return;
    const index=items.findIndex(item=>item.id===activeId);if(index<0)return;
    const el=host.current!,start=index*itemHeight,end=start+itemHeight;
    if(start<el.scrollTop)el.scrollTop=start;else if(end>el.scrollTop+el.clientHeight)el.scrollTop=end-el.clientHeight;
    setTop(el.scrollTop);
  },[activeId,itemHeight]);
  const start=Math.max(0,Math.floor(top/itemHeight)-4),end=Math.min(items.length,Math.ceil((top+height)/itemHeight)+4);
  return <div className={className} ref={host} onScroll={e=>setTop(e.currentTarget.scrollTop)}>
    <div style={{height:items.length*itemHeight,position:'relative'}}>
      {items.slice(start,end).map((item,index)=><div key={item.id} style={{position:'absolute',top:(start+index)*itemHeight,left:0,right:0,height:itemHeight}}>{renderItem(item)}</div>)}
    </div>
  </div>;
}
