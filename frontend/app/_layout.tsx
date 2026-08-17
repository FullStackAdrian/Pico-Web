import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#09090b' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="editor" options={{ presentation: 'modal', headerShown: true, title: 'Script editor' }} />
        <Stack.Screen name="versions" options={{ presentation: 'modal', headerShown: true, title: 'Script versions' }} />
        <Stack.Screen name="security" options={{ presentation: 'modal', headerShown: true, title: 'Security & administration' }} />
      </Stack>
    </>
  );
}
