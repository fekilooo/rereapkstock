import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function Icon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    首頁: focused ? '★' : '☆',
    搜尋: focused ? '⊕' : '⊕',
    設定: focused ? '⚙' : '⚙',
  };
  return (
    <Text style={{ fontSize: 20, color: focused ? '#58a6ff' : '#8b949e' }}>
      {icons[label] ?? label[0]}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#161b22', borderTopColor: '#30363d' },
        tabBarActiveTintColor: '#58a6ff',
        tabBarInactiveTintColor: '#8b949e',
        headerStyle: { backgroundColor: '#161b22' },
        headerTintColor: '#e6edf3',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '首頁',
          tabBarLabel: '首頁',
          tabBarIcon: ({ focused }) => <Icon label="首頁" focused={focused} />,
          headerTitle: '樂活五線譜',
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: '搜尋',
          tabBarLabel: '搜尋股票',
          tabBarIcon: ({ focused }) => <Icon label="搜尋" focused={focused} />,
          headerTitle: '搜尋股票',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarLabel: '設定',
          tabBarIcon: ({ focused }) => <Icon label="設定" focused={focused} />,
          headerTitle: '設定',
        }}
      />
    </Tabs>
  );
}
