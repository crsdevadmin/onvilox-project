import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useAuth } from '../lib/auth';
import { colors, radius } from '../ui/theme';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError(null);
    try { await signIn(email, password); }
    catch (e: any) { setError(e?.message ?? 'Could not sign in'); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.brand}>
        <Text style={s.logo}>GQUENCE</Text>
        <Text style={s.tag}>Clinical Nutrition · Doctor</Text>
      </View>
      <View style={s.card}>
        <Text style={s.label}>Email</Text>
        <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none"
          autoComplete="email" keyboardType="email-address" textContentType="username" />
        <Text style={s.label}>Password</Text>
        <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry
          textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Sign in</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.navy, justifyContent: 'center', padding: 24 },
  brand: { alignItems: 'center', marginBottom: 32 },
  logo: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: 4 },
  tag: { color: '#c9d3e3', marginTop: 6 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 20 },
  label: { color: colors.muted, fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, color: colors.text },
  error: { color: colors.high, marginTop: 12 },
  btn: { backgroundColor: colors.navy, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
