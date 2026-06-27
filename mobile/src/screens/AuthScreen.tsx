import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Surface everything the client actually receives from Supabase: HTTP status,
// error code, and message. NOTE: the true upstream cause (e.g. an SMTP provider
// rejection like Resend's 403 "can only send to your own email address") is NOT
// returned to the client — Supabase strips it to a generic `unexpected_failure`
// over the wire. The full reason is only in Dashboard → Logs → Auth Logs.
function formatAuthError(error: AuthError): string {
  const parts: string[] = [];
  if (typeof error.status === 'number') parts.push(`HTTP ${error.status}`);
  if (error.code) parts.push(error.code);
  parts.push(error.message);
  return parts.join(' · ');
}

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    setLoading(true);
    // No emailRedirectTo → email contains the 6-digit OTP token, not a link.
    const { error } = await supabase.auth.signInWithOtp({ email: trimmed });
    setLoading(false);
    if (error) {
      Alert.alert('Could not send code', formatAuthError(error));
    } else {
      setSent(true);
    }
  }

  async function handleVerifyCode() {
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      Alert.alert('Invalid code', 'Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: trimmed,
      type: 'email',
    });
    setLoading(false);
    if (error) {
      Alert.alert('Could not verify code', formatAuthError(error));
    }
    // On success, onAuthStateChange in App.tsx flips the session and navigates.
  }

  if (sent) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.title}>Enter code</Text>
        <Text style={styles.subtitle}>
          We emailed a 6-digit code to {email.trim()}.{'\n'}Enter it below.
        </Text>
        <TextInput
          style={[styles.input, styles.codeInput]}
          placeholder="123456"
          placeholderTextColor="#555"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          returnKeyType="done"
          onSubmitEditing={handleVerifyCode}
          autoFocus
        />
        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleVerifyCode}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Verify & sign in</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={() => { setSent(false); setCode(''); }}>
          <Text style={styles.linkBtnText}>Use a different email</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Clad</Text>
      <Text style={styles.subtitle}>Your AI outfit recommender</Text>
      <TextInput
        style={styles.input}
        placeholder="Email address"
        placeholderTextColor="#999"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        returnKeyType="send"
        onSubmitEditing={handleSendCode}
      />
      <TouchableOpacity
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={handleSendCode}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Send code</Text>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  input: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
  },
  codeInput: {
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: 8,
    fontWeight: '700',
  },
  btn: {
    width: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkBtn: { marginTop: 24 },
  linkBtnText: { color: '#6366f1', fontSize: 15 },
});
