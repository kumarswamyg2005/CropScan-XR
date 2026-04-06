import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Detect from './pages/Detect'
import Result from './pages/Result'
import About from './pages/About'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/detect" element={<Detect />} />
          <Route path="/result" element={<Result />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  )
}
