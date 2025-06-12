# Design Decisions
Wonder why this library is the way it is? Maybe you'll find answers here, maybe not.

This is a living document. Some decisions might even change due to new features or something.


## Why not `S3File extends Blob` like Bun?
Originally, we tried this approach. While it works for Bun, it doesn't translate well to a third-party Node.js library for several reasons.

### Consistency
In Bun, `S3File.size` is a `Promise<number>`, whereas in the standard, `Blob.size` is a plain `number`. TypeScript currently can't express this inconsistency cleanly, and it breaks APIs that expect `Blob.size` to be synchronous.

### Compatibility and Stability
The [File API](https://w3c.github.io/FileAPI/) standard states that methods like [`.text()`](https://w3c.github.io/FileAPI/#text-method-algo) should internally use a `get stream` operation. This same stream is also returned by `.stream()`. However, this doesn't guarantee that `.text()` actually *calls* `.stream()` -- only that it could. It may also call some internal function that returns the same.


Node.js currenly uses an internal method for this, which roughly translates to this:
```js
class Blob {
    text() {
        //...
        this.#getStream();
        //...
    }
    // bytes(), arrayBuffer(), ...
    stream() {
        return this.#getStream();
    }
    #getStream() {
        // where the magic happens
    }
}
```

If we'd extend Blob, we would run into an issue:
```js
class S3File extends Blob {
    stream() {
        // where S3File does its magic
        // no access to Blob.#getStream() and it cannot be overridden
    }
}
```
`#getStream` is just a placeholder for a private method of any kind which is not exposed (and not intended to) the end user.

Because we cannot override the private `#getStream`, we'd have to override `.text()`, `.bytes()`, etc., to use our `S3File.stream()`. This is problematic because if an API depends on the exact methods like `Blob.text`, it will call the ones we haven't overridden, resulting in an empty `Blob`. This could break **compatibility**.

Additionally, some Web APIs may rely on the internal `#getStream`. The [Fetch API](https://fetch.spec.whatwg.org/#concept-bodyinit-extract) does exactly that. As `fetch` is currently implemented in a separate library called [undici](https://github.com/nodejs/undici), it has to use `.stream()` instead of Node.js's internal `#getStream`. If someone at Node.js decides to move `fetch` into the Node.js codebase, it may eventually be refactored to use `#getStream`. That refactoring would break the ability to pass an `S3File` as a `body`. This wouldn't be fixable either.

Since Node.js uses a `Symbol` instead of an ES private method, we could theoretically retrieve it via hacks involving `Object.getOwnPropertySymbols` and override `Blob`'s internal `#getStream`. But that would depend on Node.js's implementation details and could break at any time. This compromises **stability**.

Bun doesn't have these issues because its S3 API is built into the runtime, so it's free to use any internal method it wants.

Maybe it will happen someday, but at least not for now.

## Why No Native Extension?
We tried that. For building native addons, [N-API](https://nodejs.org/api/n-api.html) is the standard approach. Native code enables certain operations (like key derivation or canonical data signing) to be performed without the overhead of repeatedly passing data between OpenSSL and JS via `node:crypto`. In fact, using native code for encryption is so effective that we found the majority of time in our N-API module was spent parsing and validating parameters. Even with that overhead, our performance came close to Bun's numbers. Going native also allows for performing HTTP requests outside the `fetch` pipeline, which could provide performance benefits. Of course, you'd still need to handle proxy settings and stuff, but it's technically feasible.

That said, using a native N-API extension doesn't magically come with superpowers that let us bypass the limitations that prevent us from doing `S3File extends Blob`. Maybe it's possible using [NAN](https://github.com/nodejs/nan), but adopting NAN for a new project might not be ideal<sup>[citation needed]</sup>.

Native modules come with their own downsides. `npm install` doesn't "just work"[^1] - in fact, it often fails. To work around that, most native libraries distribute pre-built binaries via an `optionalDependency` and platform-specific constraints. This works for most users, but there will always be someone running 32-bit ARMv6 with musl libc for some reason. So you still have to write C (or C++) in a way that's compatible with nearly every compiler, which typically means C99 or older.

Some package managers struggle with installing optional dependencies on the first run. Others disable `postinstall` scripts for security reasons - which is a good thing in general - but that also means even if we try to compile it on the user's machine, it might not even attempt to build the library in the first place.

To get around *that*, we tried using Zig as a self-contained toolchain that compiles our C (and later Zig) code into a native extension for the user's current platform. There's [solarwinds/zig-build](https://github.com/solarwinds/zig-build), which does exactly that. It works, but it requires downloading the entire Zig compiler on `npm install`, which is around 50MB at the time of writing (2025-04-15). That could be avoided... by offering pre-built binaries.

So instead of running in circles, browser vendors sat down and invented something:

[^1]: Rememer `node-sass`? Endless debugging of `node-gyp` errors? Wrong C compiler or an unusual local python installation?

### Why Not Use WASM?
WASM is great in that it avoids most of the issues described above. Shipping a single `.wasm` file inside the npm package would absolutely be an option. Which brings us to the real question: why do we want to write native code in the first place?

Writing native code allows us to directly link against OpenSSL (via N-API[^2]) or use a statically linked crypto API like `std.crypto` from Zig. The former benefits from using the most optimized OpenSSL version for the platform, while the latter is easier to distribute and works across more platforms. Both approaches likely leverage special hardware instructions for HMAC signing and SHA2 operations, which is where the real performance gains come from.

Unfortunately, WASM doesn't support hardware-accelerated hashing (or encryption in general). It's also not possible to link against the OpenSSL bundled with Node.js. So we'd end up doing SHA2 in pure software without hardware acceleration - something we could already get using `node:crypto`.

On top of that, it's not efficient to pass `string`s to WASM functions. It usually involves UTF-8 encoding into a buffer, which is exactly the kind of overhead we wanted to avoid by going native. And since WASM generally can't do I/O, it would still have to call back into JS land to perform HTTP requests. While Node.js does support [WASI](https://nodejs.org/api/wasi.html), which might help with that, it's still experimental.

To be honest, we haven't done any real benchmarks here. But we don't expect any significant benefit. Maybe we'll be proven wrong.

[^2]: Which is not compatible with Bun, since it uses BoringSSL instead of OpenSSL.

### So plain JS it is
Initially, we wanted to build something fast and cool with Zig. The Zig implementation was actually faster than our initial C draft. It works - but for now, it's not worth the effort. We're sticking with boring JavaScript for the time being. Maybe that'll change in the future.

## Why Use `node:crypto` and Break Browser Compatibility?
There's the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API), which supports what is needed to sign AWS requests in the browser. It likely uses native hardware instructions for hashing and encryption, and it's designed for general-purpose use - which it does well. Because of that, its hashing functions are built to also handle large input data efficiently. But since JavaScript is single-threaded, synchronous hashing of a lot of data could block the main thread and freeze the UI. So, the API was designed to be `async`.

But being `async` comes at a cost - both in terms of performance and ergonomics.

Using `async` for lots of small operations that don't actually need to be asynchronous introduces overhead from promises, and can lead to mutex thrashing. This is one reason why [better-sqlite3 has a **sync** API](https://github.com/WiseLibs/better-sqlite3), even though it performs I/O. [Node.js's built-in SQLite API](https://nodejs.org/api/sqlite.html) has taken the same approach.

From a usability perspective, it is often much more convenient not to be `async`. Otherwise, the function ends up [coloring the entire call tree](https://journal.stuffwithstuff.com/2015/02/01/what-color-is-your-function/).

We don't expect this library to be used in the browser. It's an edge case to manage S3 secrets client-side (who's presigning URLs in the browser anyway?). If someone really needs that, they can use the AWS SDK.

So, we decided to focus solely on server-side scenarios. Our primary target is Node.js, but coincidentally, `node:crypto` is also supported by Bun and Deno.

## Why that Weird Template Syntax?
We chose this syntax for the endpoint:
```js
const client = new S3Client({
    endpoint: "https://{bucket}.s3.{region}.amazonaws.com",
    // ...
});
```
S3 is provided in a lot of different ways. While we focus on the 80% of users, we still want the rest to at least be able to use the library for basic operations. Other libraries try to guess the `region` and/or `bucket` by parsing the `endpoint`, and apply some magic to figure out whether the service uses path-style or virtual-host-style S3 URLs. Sometimes, the user ends up fumbling around just to get a working set of settings. Getting this right as a library is [hard](https://github.com/mhart/aws4fetch/blob/f279a7ea80611b6f601617d7b3234054990165ae/src/main.js#L393-L441), [tedious](https://github.com/oven-sh/bun/blob/06e0c876f57e0974ae4f16d2495517213ed5016a/src/s3/credentials.zig#L404-L444) and sometimes [seemingly impossible without a network request](https://github.com/minio/minio-js/blob/6a821b543ef88f3615bae1c18db7cd49b4dde884/src/internal/client.ts#L757-L820).

We need `bucket` and `region` as separate values so we can support things like `file.write(..., { bucket: "other-bucket" })`. The same goes for `region`, - except it's even more important because it's used directly in the S3 signing process, so we have to know its exact value.

If we start hardcoding AWS-specific endpoint parsing, it's hard not to ask why we don't hardcode X, Y, or Z too. We want to avoid that path. There will always be some weird endpoint like `http://s3.internal.big-dax-company.de/waf-protected/r2/eu-west-1/hunter2` that breaks all assumptions.

The S3 client of Minio splits the endpoint into multiple fields. Instead of `endpoint: "https://play.min.io:9000"`, you'll have to pass:
```js
{
  endPoint: 'play.min.io',
  port: 9000,
  useSSL: true,
}
```
Which not only looks odd (SSL? Why not TLS or HTTPS? Or just "secure"?) but cannot be passed as a single environment variable. You have to have at least two and if you have a local development setup, you'll probably end up with more because you have to use `http` instead of `https` (what they call SSL).

We want you to be able to configure the endpoint using a single plain old env var. We also want you to be able to override just the `region` or `bucket` for a specific S3 operation - without needing to pass a whole new endpoint.

That's why _you_ have to provide the endpoint (template) explicitly when creating the client. Don't worry - there are examples you can copy & paste into your project.


## Why use `undici` instead of built-in `fetch` or `node:http`?
In the initial prototype, we tried both `fetch` and `node:http(s)`.

[`undici`](https://github.com/nodejs/undici) is a new HTTP API written from scratch by the Node.js team. It outperforms `node:http(s)` in both performance and ease of use.

`fetch` is built on top of undici. It inherits several design decisions made for the browser, which aren't always ideal for server-side use. The API that it uses internally is also exposed by undici, but without the browser-specific stuff.
By using undici's lower-level primitives directly, we can make our requests more efficient. For example, we don't need (or want) CORS-related logic on the server.

That said, undici comes with some trade-offs. Although it powers Node.js's built-in `fetch`, it's not exposed as a core API - so we have to install it as a separate package, which adds about ~1MB.

The AWS SDK uses the `Expect: 100-continue` header to early-return from requests that would otherwise fail. Undici doesn't support this header by design. Some S3 providers don't support it either, so even the AWS SDK includes a fallback mechanism for when it's not usable.
