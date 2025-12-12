import React, {useState} from 'react'
import Inventory from './components/Inventory'
import Market from './components/Market'
import AdminPortal from './components/AdminPortal'
import PackOpen from './components/PackOpen'
export default function App(){const [view,setView]=useState('home');return (<div className='app'><header className='top'><h1>Card Vault</h1></header><nav className='nav'><button onClick={()=>setView('open')}>Open Pack</button><button onClick={()=>setView('inventory')}>Inventory</button><button onClick={()=>setView('market')}>Market</button><button onClick={()=>setView('admin')}>Admin</button></nav><main className='main'>{view==='inventory'&&<Inventory/>}{view==='market'&&<Market/>}{view==='admin'&&<AdminPortal/>}{view==='open'&&<PackOpen/>}{view==='home'&&<div className='hero'>Welcome to Card Vault — open packs, trade, collect!</div>}</main></div>)}
