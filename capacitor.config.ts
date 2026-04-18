import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elnode.erp',
  appName: 'EL-NODE',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    LiveUpdates: {
      appId: '581cecb5',
      channel: 'Production',
      autoUpdateMethod: 'background',
      maxVersions: 3
    }
  }
};

export default config;
