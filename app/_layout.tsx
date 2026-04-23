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
          options={{ title: 'Stock Detail', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="feargreed"
          options={{ title: 'Market Sentiment', headerBackTitle: 'Back' }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
