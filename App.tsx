import React, { useEffect, useState } from 'react';
import {
  StatusBar,
  useColorScheme,
  ActivityIndicator,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Dashboard } from './src/Dashboard';
import { initI18n } from './src/i18n';
import { SecurityModule } from './src/SecurityModule';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [i18nLoaded, setI18nLoaded] = useState(false);
  const [darkModeSetting, setDarkModeSetting] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      await initI18n();
      try {
        const darkMode = await SecurityModule.getSetting('darkMode');
        setDarkModeSetting(darkMode === 'true');
      } catch {}
      setI18nLoaded(true);
    })();
  }, []);

  const useDark = darkModeSetting || isDarkMode;
  const bg = useDark ? '#0b1220' : '#F0EEE9';

  if (!i18nLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#72886f" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top']}>
        <StatusBar
          barStyle={useDark ? 'light-content' : 'dark-content'}
          backgroundColor={bg}
        />
        <Dashboard />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default App;
