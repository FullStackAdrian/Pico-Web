import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: '#111113', borderTopColor: '#27272a', height: 64, paddingBottom: 8 },
      tabBarActiveTintColor: '#a78bfa',
      tabBarInactiveTintColor: '#71717a',
    }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({color,size}) => <Ionicons name="grid-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="scripts" options={{ title: 'Scripts', tabBarIcon: ({color,size}) => <Ionicons name="code-slash-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: ({color,size}) => <Ionicons name="time-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="device" options={{ title: 'Device', tabBarIcon: ({color,size}) => <Ionicons name="hardware-chip-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({color,size}) => <Ionicons name="settings-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
