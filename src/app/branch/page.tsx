import BranchDashboard from '@/components/branch-dashboard'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Branch Analytics — PPC Command Center',
}

export default function BranchPage() {
  return <BranchDashboard />
}
