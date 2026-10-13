import { NextResponse } from "next/server";
export class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function failure(e: unknown) {
  if (e instanceof RequestError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof RangeError)
    return NextResponse.json({ error: e.message }, { status: 400 });
  if (e && typeof e === "object" && "code" in e && e.code === "P2034")
    return NextResponse.json(
      {
        error:
          "The schedule changed during this request. Refresh and try again.",
      },
      { status: 409 },
    );
  console.error(e);
  return NextResponse.json(
    { error: "Operation failed. No changes were committed." },
    { status: 500 },
  );
}
