import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Checkin from './pages/Checkin'
import How from './pages/How'
import Landing from './pages/Landing'
import Offer from './pages/Offer'
import Pay from './pages/Pay'
import Plan from './pages/Plan'
import Quiz from './pages/Quiz'
import Summary from './pages/Summary'
import Tax from './pages/Tax'
import { Link, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const wrap = (el: React.ReactNode) => <Layout>{el}</Layout>

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <>
    <ScrollTop />
    <Routes>
      <Route path="/" element={wrap(<Landing />)} />
      <Route path="/start" element={wrap(<Quiz />)} />
      <Route path="/summary/:caseId" element={wrap(<Summary />)} />
      <Route path="/pay/:caseId" element={wrap(<Pay />)} />
      <Route path="/plan/:caseId" element={wrap(<Plan />)} />
      <Route path="/checkin/:caseId" element={wrap(<Checkin />)} />
      <Route path="/offer/:caseId" element={wrap(<Offer />)} />
      <Route path="/tax/:caseId" element={wrap(<Tax />)} />
      <Route path="/how" element={wrap(<How />)} />
      <Route path="*" element={wrap(<div className="mx-auto max-w-xl px-4 py-24 text-center"><h1 className="text-3xl font-[460]">Page not found</h1><Link to="/" className="btn btn-primary mt-6">Home</Link></div>)} />
    </Routes>
    </>
  )
}
