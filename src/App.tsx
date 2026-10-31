import { Activity } from '@/components/Activity'
import { AgreementDetails } from '@/components/AgreementDetails'
import { AgreementsPage } from '@/components/AgreementsPage'
import { CreateAgreement } from '@/components/CreateAgreement'
import { Dashboard } from '@/components/Dashboard'
import { Layout } from '@/components/Layout'
import { MilestonesPage } from '@/components/MilestonesPage'
import { SettingsPage } from '@/components/SettingsPage'
import { useRoute } from '@/hooks/useRoute'

export default function App() {
  const route = useRoute()
  return (
    <Layout route={route}>
      {route.name === 'dashboard' && <Dashboard />}
      {route.name === 'create' && <CreateAgreement />}
      {route.name === 'activity' && <Activity />}
      {route.name === 'agreements' && <AgreementsPage />}
      {route.name === 'milestones' && <MilestonesPage />}
      {route.name === 'settings' && <SettingsPage />}
      {route.name === 'agreement' && <AgreementDetails key={route.id.toString()} id={route.id} />}
    </Layout>
  )
}
