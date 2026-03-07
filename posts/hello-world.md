---
title: Devlog #1 Hello World
date: 2026-03-05
description: The first devlog for Caracal, covering goals, current progress, and next milestones.
---

Welcome to the first Caracal devlog.

```cara
def main()
{
    print("Hello, World!");
}
```

This post is the start of my online devlog about the Caracal compiler and tooling. My goal is to document what is working and where I'm heading with the project.

## Why this project exists

Since every new language apparently needs to justify their existence, here is mine:
Caracal exists because I'm interested in language design and like to experiment with compilers and related tech. I'm trying to create a language that I'll enjoy using. It would be cool if other people are gonna like and use the language too, but it's also fine if that doesn't happen.

## Status

The basic language features are currently slowly getting worked out. 
Alot of the syntax is already getting parsed, whats mainly missing here is variant types and generics.
A big chunk of that is already getting type checked and has working LLVM codegen, like functions, constants and variables. My tests currently only test the happy path of the compiler, the reason for that is because I can make some good progress on the language without getting bogged down. Another reason is that I don't have diagnostics yet and need to prepare tests for errors and warnings.
There also isn't a standard library or a way to create projects yet.
I created this site, as you can see, to document the language and keep a devlog that I can link to people.

## What is next

I'm currently working on getting types into the language, static methods work already tho. After that I'm either working on variant types, multi-file support, or some of the generics. Maybe I'll work on diagnostics, they are a bit overdue.

## Future Devlogs

Future posts will probably gonna include what changed since the last post or what problems I was fighting with. I'm probably also gonna outline the next short-term plans for the project.

That should be it for the first post, more updates later.

Armin
