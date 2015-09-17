# FFTools

A collection of tools that make working with Firefox profiling data easier.

## Building

```
npm install
make
```

## CLI

Record a profile in Firefox and save it to disk as `profile.json` then:

```
node build/cli.js profile.json
```
