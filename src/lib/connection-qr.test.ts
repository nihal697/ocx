import { test } from "node:test"
import assert from "node:assert/strict"
import { parseConnectionQr } from "./connection-qr.ts"

test("bare host and host:port stay in quick mode", () => {
  assert.deepEqual(parseConnectionQr("192.168.1.100"), { ip: "192.168.1.100" })
  assert.deepEqual(parseConnectionQr("192.168.1.100:4096"), { ip: "192.168.1.100", port: "4096" })
  assert.deepEqual(parseConnectionQr("http://192.168.1.100:4096"), { ip: "192.168.1.100", port: "4096" })
})

test("URL with credentials goes to advanced mode", () => {
  assert.deepEqual(parseConnectionQr("http://192.168.1.100:4096?password=secret"), {
    url: "http://192.168.1.100:4096?password=secret",
    username: undefined,
    password: "secret",
    directory: undefined,
  })
  assert.deepEqual(parseConnectionQr("https://my-ocx.trycloudflare.com"), {
    url: "https://my-ocx.trycloudflare.com",
    username: undefined,
    password: undefined,
    directory: undefined,
  })
})

test("JSON payload with host and extras", () => {
  assert.deepEqual(parseConnectionQr('{"host":"10.0.0.5:4096","password":"pw","directory":"/home/u/proj"}'), {
    url: "10.0.0.5:4096",
    password: "pw",
    directory: "/home/u/proj",
  })
})

test("garbage and empty return null", () => {
  assert.equal(parseConnectionQr(""), null)
  assert.equal(parseConnectionQr("   "), null)
  assert.equal(parseConnectionQr("not a url at all!!!"), null)
  assert.equal(parseConnectionQr('{"nope":true}'), null)
  assert.equal(parseConnectionQr("{broken"), null)
})
