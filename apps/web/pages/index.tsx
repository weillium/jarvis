'use client';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Card = { title: string; body: string; refs?: { label: string }[] };

type CardsMessage = { cards?: Card[] };

export default function Home(){
  const [cards,setCards]=useState<Card[]>([]);
  useEffect(()=>{
    const ws: Socket = io('/ws/cards', { path:'/socket.io', transports:['websocket'], autoConnect:true });
    ws.on('message', (payload:string)=>{
      try{
        const m: CardsMessage = JSON.parse(payload);
        setCards((c)=>[...c, ...(m.cards||[])]);
      } catch(e){
        console.error(e);
      }
    });
    return ()=> ws.disconnect();
  },[]);
  return <main style={{padding:24}}>
    <h1>Jarvis</h1>
    {cards.map((c,i)=>(<div key={i} style={{border:'1px solid #ddd',padding:12,margin:'12px 0'}}>
      <strong>{c.title}</strong>
      <p>{c.body}</p>
      <small>{(c.refs||[]).map((r)=>r.label).join(', ')}</small>
    </div>))}
  </main>;
}
