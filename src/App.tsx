import { AppShell } from './app/AppShell';
import { useAppRuntime } from './app/useAppRuntime';

export function App() {
  return <AppShell {...useAppRuntime()} />;
}
