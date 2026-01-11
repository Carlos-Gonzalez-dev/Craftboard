# Craft URL Scheme

The URL scheme lets users and developers of other apps send commands to Craft.

> Source: https://support.craft.do/hc/en-us/articles/360020168838-Using-URL-Scheme

## Available Commands

- Open a document
- Open a space
- Create a document
- Append to an existing document
- Start search in a Space
- Access Daily Notes

---

## Open Page

Opens a specific document or page in Craft.

**Parameters:**
- `spaceId` (required) - Your user ID (random GUID). Get it by clicking "Copy Deeplink" on a document
- `blockId` (required) - The ID of the specific block/page. Get it by clicking "Copy Deeplink"

**Example:**
```
craftdocs://open?spaceId=<spaceId>&blockId=<blockId>
```

> Note: Only works if you're a member of the space

---

## Open Space

Opens a specific space in Craft.

**Parameters:**
- `spaceId` (required) - Get this from a deeplink by clicking "Copy Deeplink"
- `tab` (optional) - `calendar`, `search`, or `documents`

**Example:**
```
craftdocs://openspace?spaceId=<spaceId>&tab=<tab>
```

> Note: Only works if you're a member of the space

---

## Create New Empty Document

Creates a new empty document in your currently open space.

**Parameters:** None

**Example:**
```
craftdocs://createnewdocument
```

---

## Create Document

Creates a new document with specified content and title.

**Parameters:**
- `spaceId` (required) - Get this from a deeplink by clicking "Copy Deeplink"
- `title` (required) - Percentage encoded plaintext title
- `content` (required) - Percentage encoded markdown (images not supported yet)
- `folderId` (required) - Can be empty, but the parameter must be included

**Example:**
```
craftdocs://createdocument?spaceId=<spaceId>&title=<title>&content=<content>&folderId=<folderId>
```

---

## Append to Document

Adds a new block to an existing document.

**Parameters:**
- `spaceId` (required) - Get this from a deeplink by clicking "Copy Deeplink"
- `parentBlockId` (required) - The blockId of the document
- `content` (required) - Percentage encoded string
- `index` (required) - Index position for the new block (0 to prepend, large number to append)

**Example:**
```
craftdocs://createblock?parentBlockId=<parentBlockId>&spaceId=<spaceId>&content=<content>&index=<index>
```

---

## Search in Workspace

Starts a search in a given workspace and prefills the search field.

**Parameters:**
- `spaceId` (required) - Get this from a deeplink by clicking "Copy Deeplink"
- `query` (required) - Percentage encoded search query

**Example:**
```
craftdocs://opensearch?spaceId=<spaceId>&query=<query>
```

---

## Access Daily Notes

Quick access to specific daily notes.

**Examples:**
- **Yesterday:** `craftdocs://openByQuery?query=yesterday&spaceId=<spaceId>`
- **Today:** `craftdocs://openByQuery?query=today&spaceId=<spaceId>`
- **Tomorrow:** `craftdocs://openByQuery?query=tomorrow&spaceId=<spaceId>`
