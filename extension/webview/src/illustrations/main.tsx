import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { bootstrapStorylineTheme } from '../shared/storyline-theme.js'
import './styles.css'

bootstrapStorylineTheme()
createRoot(document.getElementById('root')!).render(<App />)
