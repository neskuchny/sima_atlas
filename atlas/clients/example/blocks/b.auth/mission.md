# b.auth — mission

OAuth authentication (Google + Apple for iOS) issuing JWT sessions.
The integration needs to be tight: onboarding should have minimum
friction (one tap via the native sheet) without compromising on privacy.

JWTs are short-lived (15 min) plus a refresh token (30 days) with rotation
on every refresh. No email/password — that's an extra surface attack
vector and unnecessary friction for the user.
