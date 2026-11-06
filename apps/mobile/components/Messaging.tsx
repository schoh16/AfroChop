import { authenticatedFetch as fetch } from '../lib/session';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export type MessagePartner = { id: string; name: string };

type Participant = { id: string; role: string; name: string };
type ChatMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  createdAt: string;
};
type ConversationSummary = {
  participant: Participant;
  lastMessage: ChatMessage;
  unreadCount: number;
};

type Props = {
  token: string;
  apiBaseUrl: string;
  initialPartner?: MessagePartner | null;
  onBack: () => void;
  onRequestQuote?: () => void;
};

const POLL_MS = 5000;

export function Messaging({ token, apiBaseUrl, initialPartner = null, onBack, onRequestQuote }: Props) {
  const [partner, setPartner] = useState<MessagePartner | null>(initialPartner);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discussionComplete, setDiscussionComplete] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });
      const body = (await response.json().catch(() => null)) as
        | (T & { message?: string | string[] })
        | null;
      if (!response.ok) {
        const message = Array.isArray(body?.message) ? body?.message[0] : body?.message;
        throw new Error(message ?? 'Request failed.');
      }
      return body as T;
    },
    [apiBaseUrl, token],
  );

  const partnerId = partner?.id ?? null;

  const load = useCallback(async () => {
    try {
      if (partnerId) {
        const result = await request<{ participant: Participant; items: ChatMessage[]; discussionComplete: boolean }>(
          `/messages/with/${partnerId}?limit=100`,
        );
        setMessages(result.items);
        setDiscussionComplete(result.discussionComplete === true);
      } else {
        setConversations(await request<ConversationSummary[]>('/messages/conversations'));
      }
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, [partnerId, request]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function send() {
    const content = draft.trim();
    if (!content || !partnerId || sending) return;
    setSending(true);
    try {
      const sent = await request<ChatMessage>('/messages', {
        method: 'POST',
        body: JSON.stringify({ recipientId: partnerId, content }),
      });
      setMessages((current) => [...current, sent]);
      setDraft('');
      setError(null);
      await load();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  }

  if (!partner) {
    return (
      <View style={styles.container}>
        <Header title="Messages" onBack={onBack} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? (
          <ActivityIndicator style={styles.loader} color="#c2410c" />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {conversations.length === 0 ? (
              <Text style={styles.empty}>
                No conversations yet. Open a cook&apos;s profile and tap “Message cook” to start negotiating your order.
              </Text>
            ) : (
              conversations.map((item) => (
                <Pressable
                  key={item.participant.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setMessages([]);
                    setDiscussionComplete(false);
                    setLoading(true);
                    setPartner({ id: item.participant.id, name: item.participant.name });
                  }}
                  style={styles.conversation}
                >
                  <View style={styles.conversationText}>
                    <Text style={styles.conversationName}>{item.participant.name}</Text>
                    <Text numberOfLines={1} style={styles.conversationPreview}>
                      {item.lastMessage.content}
                    </Text>
                  </View>
                  {item.unreadCount > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.unreadCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <Header
        title={partner.name}
        onBack={() => {
          if (initialPartner) {
            onBack();
          } else {
            setPartner(null);
            setLoading(true);
          }
        }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {onRequestQuote ? (
        <View style={styles.bookingSteps}>
          <Text style={styles.empty}>
            Discuss the menu, portions, date, location, and dietary needs. Both of you must send a message before requesting a quote.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={loading || sending || !discussionComplete || Boolean(error)}
            onPress={onRequestQuote}
          >
            <Text style={styles.back}>
              {discussionComplete ? 'Continue to quote request' : 'Waiting for both of you to reply'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.thread}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {loading ? (
          <ActivityIndicator color="#c2410c" />
        ) : messages.length === 0 ? (
          <Text style={styles.empty}>
            No messages yet. Say hello to {partner.name} to discuss the date, guest count, budget and menu.
          </Text>
        ) : (
          messages.map((message) => {
            const mine = message.senderId !== partner.id;
            return (
              <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={mine ? styles.mineText : styles.theirsText}>{message.content}</Text>
                <Text style={mine ? styles.mineTime : styles.theirsTime}>
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message"
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message"
          multiline
          maxLength={2000}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={sending || !draft.trim()}
          onPress={() => void send()}
          style={[styles.send, (sending || !draft.trim()) && styles.sendDisabled]}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bookingSteps: { padding: 12, gap: 8 },
  container: { flex: 1, backgroundColor: '#fff7ed' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#fed7aa',
  },
  back: { color: '#c2410c', fontWeight: '700', fontSize: 16 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: '#431407' },
  error: { color: '#b91c1c', padding: 12 },
  loader: { marginTop: 32 },
  list: { padding: 16, gap: 10 },
  empty: { color: '#7c2d12', textAlign: 'center', padding: 24, lineHeight: 20 },
  conversation: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 14,
    gap: 10,
  },
  conversationText: { flex: 1 },
  conversationName: { fontWeight: '800', color: '#431407', fontSize: 16 },
  conversationPreview: { color: '#78716c', marginTop: 2 },
  badge: {
    backgroundColor: '#c2410c',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  thread: { padding: 16, gap: 8, flexGrow: 1 },
  bubble: { maxWidth: '80%', borderRadius: 16, padding: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#c2410c' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#fed7aa' },
  mineText: { color: '#fff', fontSize: 15 },
  theirsText: { color: '#431407', fontSize: 15 },
  mineTime: { color: '#fed7aa', fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  theirsTime: { color: '#a8a29e', fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#fed7aa',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fffbf5',
  },
  send: { backgroundColor: '#c2410c', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 11 },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontWeight: '800' },
});
