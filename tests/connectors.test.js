// Calendar feeds: one-off, all-day and repeating events come out as Allison events.
const test = require("node:test"), assert = require("node:assert"), http = require("http");
const C = require("../src/connectors");

const ics = ["BEGIN:VCALENDAR", "VERSION:2.0",
  "BEGIN:VEVENT", "UID:a1", "DTSTART:20991012T150000Z", "SUMMARY:Client call", "END:VEVENT",
  "BEGIN:VEVENT", "UID:a2", "DTSTART;VALUE=DATE:20991014", "SUMMARY:Delivery day", "END:VEVENT",
  "END:VCALENDAR"].join("\r\n");

test("calendar feed parses events", async () => {
  const srv = http.createServer((q, r) => r.end(ics)); await new Promise(r => srv.listen(0, r));
  const realNow = Date.now; Date.now = () => Date.UTC(2099, 9, 9);
  try {
    const ev = await C.calendar(`http://localhost:${srv.address().port}/x.ics`, "gcal");
    assert.deepStrictEqual(ev.map(e => e.what).sort(), ["Client call", "Delivery day"]);
    assert.ok(ev.find(e => e.what === "Delivery day").allDay);
    assert.ok(ev.every(e => e.src === "gcal" && /^\d{4}-\d\d-\d\d$/.test(e.d)));
  } finally { Date.now = realNow; srv.close(); }
});

test("repeating events expand inside the window", async () => {
  const rep = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:g", "DTSTART:20991009T180000Z", "RRULE:FREQ=DAILY;COUNT=3", "SUMMARY:Gym", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const srv = http.createServer((q, r) => r.end(rep)); await new Promise(r => srv.listen(0, r));
  const realNow = Date.now; Date.now = () => Date.UTC(2099, 9, 9);
  try { assert.strictEqual((await C.calendar(`http://localhost:${srv.address().port}/`, "ical")).length, 3); }
  finally { Date.now = realNow; srv.close(); }
});
