import { Stack } from 'expo-router';
import { colors } from '../../ui/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: '#fff',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Needs You This Week' }} />
      <Stack.Screen name="patients" options={{ title: 'My Patients' }} />
      <Stack.Screen name="patient/[id]" options={{ title: 'Patient' }} />
    </Stack>
  );
}
