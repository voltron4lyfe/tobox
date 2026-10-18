"""Notifications: events decide *what* to say, channels decide *how* to deliver it.

- `events`: pure functions turning a day's state into a `Notification` (or nothing).
- `channels`: the `Channel` protocol and the registry of delivery methods (Web Push, Discord).
- `dispatch`: fans a notification out to every enabled channel and records the outcome.
- `scheduler`: background loop firing time-based reminders from the user's preferences.

Adding a channel (e.g. email): implement `Channel` in `channels/`, register it in
`channels.CHANNELS`, and add its preference model to `schemas.ChannelPrefs`.
"""
