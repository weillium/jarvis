// Ultra-minimal test page to verify basic rendering
import { View, Text } from 'react-native';

export default function TestPage() {
  console.log('[TestPage] Rendering');
  return (
    <View style={{ flex: 1, backgroundColor: 'red', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: 'white', fontSize: 20 }}>TEST PAGE - If you see this, basic rendering works!</Text>
    </View>
  );
}

