import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-12 h-12 bg-blue-800 rounded-xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-lg">SR</span>
        </div>
        <h1 className="text-3xl font-semibold text-slate-800 mb-2">
          Shiprocket PPC Dashboard
        </h1>
        <p className="text-slate-500 mb-6">Performance Marketing Command Center</p>
        <Link 
          href="/dashboard"
          className="bg-blue-800 text-white px-6 py-3 rounded-lg hover:bg-blue-900"
        >
          Open Dashboard →
        </Link>
      </div>
    </main>
  )
}
