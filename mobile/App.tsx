import { View, Text, AppRegistry } from 'react-native';

function App() {
  return (
    <View style={{ flex: 1, backgroundColor: '#FF0000', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: 'bold' }}>
        DIRECT ENTRY TEST
      </Text>
      <Text style={{ color: '#FFFFFF', fontSize: 18, marginTop: 20 }}>
        This bypasses expo-router
      </Text>
    </View>
  );
}

AppRegistry.registerComponent('main', () => App);
