import React, {useEffect, useState} from 'react';
import { SafeAreaView, Text, View, ScrollView } from 'react-native';
import { io, Socket } from 'socket.io-client';

interface Card { title: string; body: string; refs?: { label: string }[] }

export default function App(){
  const [cards,setCards]=useState<Card[]>([]);
  useEffect(()=>{
    const ws: Socket = io('http://localhost:8080/ws/cards', { path:'/socket.io', transports:['websocket'] });
    ws.on('message', (payload:string)=>{
      try{
        const m = JSON.parse(payload) as { cards?: Card[] };
        setCards((c)=>[...c, ...(m.cards||[])]);
      } catch(err){
        console.warn(err);
      }
    });
    return ()=> ws.disconnect();
  },[]);
  return <SafeAreaView>
    <ScrollView style={{padding:16}}>
      <Text style={{fontSize:24, fontWeight:'700'}}>Jarvis</Text>
      {cards.map((c,i)=>(<View key={i} style={{borderWidth:1, borderColor:'#ddd', padding:12, marginVertical:8}}>
        <Text style={{fontWeight:'700'}}>{c.title}</Text>
        <Text>{c.body}</Text>
      </View>))}
    </ScrollView>
  </SafeAreaView>;
}
