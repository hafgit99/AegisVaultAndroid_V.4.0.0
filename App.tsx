import React, { useEffect, useState } from 'react';
import { StatusBar, ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Dashboard } from './src/Dashboard';
import { initI18n } from './src/i18n';
import { ThemeProvider, useTheme } from './src/ThemeContext';

function AppContent(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const [i18nLoaded, setI18nLoaded] = useState(false);

  useEffect(() => {
    initI18n().then(() => setI18nLoaded(true));
  }, []);

  if (!i18nLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.sage} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <StatusBar
          barStyle={colors.statusBarStyle}
          backgroundColor={colors.statusBarBg}
        />
        <Dashboard />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
