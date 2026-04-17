import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elnode.erp',
  appName: 'EL NODE ERP',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
