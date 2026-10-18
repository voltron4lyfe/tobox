import { useState } from 'react'
import { Navigate } from 'react-router'

import { useDay } from '../api/hooks'
import { LoadingBlock } from '../components/PageHeader'
import { today } from '../lib/dates'

const EVENING_HOUR = 17

/** Send the user to the right ritual for the moment: plan → track → review. */
export function HomeRedirect() {
  const [hour] = useState(() => new Date().getHours())
  const { data, isPending, error } = useDay(today())
  if (isPending) return <LoadingBlock />
  if (error || !data) return <Navigate to="/today" replace />
  if (!data.planned_at && data.items.length === 0) return <Navigate to="/plan" replace />
  if (hour >= EVENING_HOUR && !data.reviewed_at) return <Navigate to="/review" replace />
  return <Navigate to="/today" replace />
}
