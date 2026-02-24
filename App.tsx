import React, { useEffect, useState } from 'react';
import { StatusBar, useColorScheme, ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Dashboard } from './src/Dashboard';
import { initI18n } from './src/i18n';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [i18nLoaded, setI18nLoaded] = useState(false);

  useEffect(() => {
    initI18n().then(() => setI18nLoaded(true));
  }, []);

  if (!i18nLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#F0EEE9', justifyContent: 'center' }}><ActivityIndicator size="large" color="#72886f" /></View>;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F0EEE9' }} edges={['top']}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor="#F0EEE9"
        />
        <Dashboard />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default App;
