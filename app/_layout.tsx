import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0d1117' }}>
      <StatusBar style="light" backgroundColor="#0d1117" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#161b22' },
          headerTintColor: '#e6edf3',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0d1117' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="stock/[symbol]"
          options={{ title: '股票詳情', headerBackTitle: '返回' }}
        />
        <Stack.Screen
          name="feargreed"
          options={{ title: '恐慌貪婪指數｜歷史走勢', headerBackTitle: '返回' }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
