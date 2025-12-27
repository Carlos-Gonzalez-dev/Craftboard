## Craft URL Scheme Commands

Here are all the available Craft URL scheme commands and their parameters:

### 1. **Open Page**

Opens a specific document or page in Craft.

**Parameters:**

- `spaceId` (required) - Your user ID (usually a random GUID). Get it by clicking "Copy Deeplink" on a document
- `blockId` (required) - The ID of the specific block/page. Get it by clicking "Copy Deeplink" in a document

**Example:**

```other
craftdocs://open?spaceId=<spaceId>&blockId=<blockId>
```

**Note:** Only works if you're a member of the space.

---

### 2. **Open Space**

Opens a specific space in Craft.

**Parameters:**

- `spaceId` (required) - Get this from a deeplink by clicking "Copy Deeplink"
- `tab` (optional) - Specify which tab to open: `calendar`, `search`, or `documents`

**Example:**

```other
craftdocs://openspace?spaceId=<spaceId>&tab=<tab>
```

**Note:** Only works if you're a member of the space.

---

### 3. **Create New Empty Document**

Creates a new empty document in your currently open space.

**Parameters:** None

**Example:**

```other
craftdocs://createnewdocument
```

---

### 4. **Create Document**

Creates a new document with specified content and title.

**Parameters:**

- `spaceId` (required) - Get this from a deeplink by clicking "Copy Deeplink"
- `title` (required) - Percentage encoded plaintext title
- `content` (required) - Percentage encoded markdown (images not supported yet)
- `folderId` (required) - Can be empty, but the parameter must be included

**Example:**

```other
craftdocs://createdocument?spaceId=<spaceId>&title=<title>&content=<content>&folderId=<folderId>
```

---

### 5. **Append to Document**

Adds a new block to an existing document.

**Parameters:**

- `spaceId` (required) - Get this from a deeplink by clicking "Copy Deeplink"
- `parentBlockId` (required) - The blockId of the document
- `content` (required) - Percentage encoded string
- `index` (required) - Index position for the new block (0 to prepend, large number to append)

**Example:**

```other
craftdocs://createblock?parentBlockId=<parentBlockId>&spaceId=<spaceId>&content=<content>&index=<index>
```

---

### 6. **Search in Workspace**

Starts a search in a given workspace and prefills the search field.

**Parameters:**

- `spaceId` (required) - Get this from a deeplink by clicking "Copy Deeplink"
- `query` (required) - Percentage encoded search query

**Example:**

```other
craftdocs://opensearch?spaceId=<spaceId>&query=<query>
```

---

### 7. **Access Daily Notes**

Quick access to specific daily notes.

**Available shortcuts:**

- **Yesterday:** `craftdocs://openByQuery?query=yesterday&spaceId=<spaceId>`
- **Today:** `craftdocs://openByQuery?query=today&spaceId=<spaceId>`
- **Tomorrow:** `craftdocs://openByQuery?query=tomorrow&spaceId=<spaceId>`
