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
import { AppMonitoring } from './src/AppMonitoring';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [i18nLoaded, setI18nLoaded] = useState(false);
  const [darkModeSetting, setDarkModeSetting] = useState<boolean>(false);

  // Sync dark mode setting from SecurityModule events or periodically
  useEffect(() => {
    const checkDark = async () => {
      const dark = await SecurityModule.getAppConfigSetting('darkMode');
      if (dark === true || dark === 'true') {
        if (!darkModeSetting) setDarkModeSetting(true);
      } else {
        if (darkModeSetting) setDarkModeSetting(false);
      }
    };
    
    // Initial check
    checkDark();
    
    // Periodically check for changes (since we don't have a global event emitter for settings)
    const interval = setInterval(checkDark, 1000);
    return () => clearInterval(interval);
  }, [darkModeSetting]);

  useEffect(() => {
    (async () => {
      await AppMonitoring.initialize();
      await initI18n();
      try {
        const darkMode = await SecurityModule.getAppConfigSetting('darkMode');
        setDarkModeSetting(darkMode === true || darkMode === 'true');
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
