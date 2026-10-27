import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { IconCheck, IconChevronRight, IconPlus, IconX } from '../components/icons'
import { ErrorMessage, Message, PageHeader, Screen, Skeleton } from '../components/ui'
import { useFriendActions, useFriendCards, useFriends, useItems } from '../lib/queries'
import { store, type Friend, type FriendRequestResult, type Profile } from '../lib/store'
import { swapOptions } from '../lib/swaps'

export const friendProfile = (f: Friend): Profile => ({ display_name: f.display_name, avatar_mode: f.avatar_mode, avatar_card_id: f.avatar_card_id, currency_display: 'both' })

const RESULT_TEXT: Record<FriendRequestResult, (name: string) => string> = {
  requested: (n) => `Request sent to ${n}. You'll see each other's spares once they accept.`,
  accepted: (n) => `${n} had already asked you, so you're now friends.`,
  pending: (n) => `You've already asked ${n}. Waiting for them to accept.`,
  friends: (n) => `You and ${n} are already friends.`,
  not_found: () => 'No one with that email uses Card Vault.',
  self: () => "That's your own email.",
}

export function Swaps() {
  const friends = useFriends()
  const list = friends.data ?? []
  const incoming = list.filter((f) => f.status === 'pending' && f.incoming)
  const outgoing = list.filter((f) => f.status === 'pending' && !f.incoming)
  const accepted = list.filter((f) => f.status === 'accepted')

  if (!store.friendsAvailable) {
    return (
      <Screen>
        <PageHeader eyebrow="Friends" title="Swaps" />
        <Message title="Swaps need an account" body="Friends and swaps work when the app is connected to Supabase, so each collector has their own account." />
      </Screen>
    )
  }

  return (
    <Screen>
      <PageHeader eyebrow="Friends" title="Swaps" />
      <AddFriend />

      {incoming.length > 0 && (
        <Section title="Friend requests">
          {incoming.map((f) => (
            <Request key={f.friendship_id} friend={f} />
          ))}
        </Section>
      )}

      <Section title="Your friends">
        {friends.isLoading ? (
          <Skeleton className="h-[76px] !rounded-[22px]" />
        ) : friends.error ? (
          <ErrorMessage error={friends.error} retry={() => friends.refetch()} />
        ) : accepted.length === 0 ? (
          <p className="surface !rounded-[20px] px-5 py-4 text-[14px] text-mute">
            Add a friend by their email. Once they accept, you'll see which cards you could swap to help each other finish sets.
          </p>
        ) : (
          accepted.map((f) => <FriendRow key={f.friendship_id} friend={f} />)
        )}
        {outgoing.map((f) => (
          <div key={f.friendship_id} className="flex items-center gap-3 rounded-[20px] border border-dashed border-white/15 p-3 pr-4">
            <Avatar profile={friendProfile(f)} size={40} />
            <div className="min-w-0 flex-1 text-[14px] text-mute">
              Waiting for <span className="font-semibold text-ink">{f.display_name}</span> to accept
            </div>
            <CancelButton friend={f} label="Cancel" />
          </div>
        ))}
      </Section>
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="mt-1 text-[22px] font-bold tracking-[-.03em]">{title}</h2>
      {children}
    </section>
  )
}

function AddFriend() {
  const [email, setEmail] = useState('')
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null)
  const { request } = useFriendActions()

  return (
    <form
      className="surface flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        const value = email.trim()
        if (!value) return
        setNote(null)
        request.mutate(value, {
          onSuccess: ({ result, name }) => {
            setNote({ text: RESULT_TEXT[result](name ?? 'them'), ok: result !== 'not_found' && result !== 'self' })
            if (result === 'requested' || result === 'accepted') setEmail('')
          },
          onError: () => setNote({ text: "Couldn't send that. Check your connection and try again.", ok: false }),
        })
      }}
    >
      <span className="eyebrow">Add a friend</span>
      <div className="flex gap-2">
        <input
          className="field"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="off"
          placeholder="Their email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Friend's email"
        />
        <button type="submit" className="btn flex-none" disabled={!email.trim() || request.isPending}>
          <IconPlus size={18} /> Add
        </button>
      </div>
      {note && (
        <p role="status" className={`text-[13px] font-medium ${note.ok ? 'text-up' : 'text-down'}`}>
          {note.text}
        </p>
      )}
    </form>
  )
}

function Request({ friend }: { friend: Friend }) {
  const { respond } = useFriendActions()
  return (
    <div className="surface flex items-center gap-3 !rounded-[20px] p-3" style={{ borderColor: 'rgba(244,114,182,.4)', boxShadow: '0 0 20px rgba(244,114,182,.12)' }}>
      <Avatar profile={friendProfile(friend)} size={44} ring />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{friend.display_name}</div>
        <div className="text-[12.5px] text-mute">wants to swap cards with you</div>
      </div>
      <button type="button" aria-label="Decline" className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--chip)] text-mute" disabled={respond.isPending} onClick={() => respond.mutate({ id: friend.friendship_id, accept: false })}>
        <IconX size={18} />
      </button>
      <button type="button" className="btn flex-none !min-h-10 !px-4 !text-[14px]" disabled={respond.isPending} onClick={() => respond.mutate({ id: friend.friendship_id, accept: true })}>
        <IconCheck size={16} /> Accept
      </button>
    </div>
  )
}

function CancelButton({ friend, label }: { friend: Friend; label: string }) {
  const { remove } = useFriendActions()
  return (
    <button type="button" className="chip-btn !min-h-9 flex-none" disabled={remove.isPending} onClick={() => remove.mutate(friend.friendship_id)}>
      {label}
    </button>
  )
}

function FriendRow({ friend }: { friend: Friend }) {
  const mine = useItems()
  const theirs = useFriendCards(friend.friend_id)
  const options = mine.data && theirs.data ? swapOptions(mine.data, theirs.data) : null

  return (
    <Link to={`/swaps/${friend.friend_id}`} className="surface flex items-center gap-3.5 !rounded-[22px] p-3 pr-4 transition-colors hover:border-accent">
      <Avatar profile={friendProfile(friend)} size={52} ring />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-semibold">{friend.display_name}</div>
        <div className="mono text-[11.5px] text-mute">
          {options ? `${options.theyCanGive.length} for you · ${options.youCanGive.length} for them` : theirs.isLoading ? 'Checking cards…' : '—'}
        </div>
      </div>
      {options && options.swaps > 0 ? (
        <span className="flex-none rounded-full bg-sel px-3 py-1.5 text-[13px] font-bold text-white" style={{ boxShadow: 'var(--sel-shadow)' }}>
          {options.swaps} {options.swaps === 1 ? 'swap' : 'swaps'}
        </span>
      ) : (
        options && <span className="mono flex-none text-[11px] text-mute">No swaps yet</span>
      )}
      <IconChevronRight size={18} className="flex-none text-mute" />
    </Link>
  )
}
