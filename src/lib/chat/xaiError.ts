/**
 * Turn an xAI failure into a message that says what actually went wrong.
 *
 * The routes used to map every upstream failure to "Grok could not hear that",
 * which points at the microphone. When the real cause was a 403 saying the
 * team had no credits, that sent debugging in the wrong direction entirely.
 *
 * The visitor gets a short, honest reason. The operator detail — which can
 * carry an account or team identifier — goes to the server log instead.
 */

export type XaiFailure = { status: number; message: string };

/** Pull xAI's own explanation out of a failed response, if it sent one. */
async function upstreamDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return "";
    try {
      const body = JSON.parse(text) as { error?: string; code?: string };
      return body.error || body.code || text.slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return "";
  }
}

/**
 * `fallback` is the message for failures with no clearer cause — usually
 * something the visitor can act on, like speaking closer to the microphone.
 */
export async function xaiFailure(
  res: Response,
  route: string,
  fallback: string,
): Promise<XaiFailure> {
  const detail = await upstreamDetail(res);
  console.error(`[${route}] xAI ${res.status}: ${detail || "(no detail)"}`);

  if (res.status === 401) {
    return {
      status: 502,
      message: "Voice is unavailable: the xAI key was rejected. Check XAI_API_KEY.",
    };
  }
  if (res.status === 403) {
    // In practice this is an account without credits or licences, which no
    // amount of retrying or speaking more clearly will fix.
    return {
      status: 502,
      message: "Voice is unavailable: the xAI account cannot make this request. See the server log.",
    };
  }
  if (res.status === 429) {
    return { status: 429, message: "Voice is busy right now. Try again in a moment." };
  }
  return { status: 502, message: fallback };
}
