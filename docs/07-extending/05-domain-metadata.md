Extending image metadata
========================

The key Grid metadata can be extended to have additional fully editable and searchable fields that suit your
organisation's workflows or domain(s).

Overview
--------

These additional fields (referred to as domain specific metadata fields) are defined through configuration by
specifying a schema represented by specifications and fields.

Why through configuration? To allow modifications to your installation of the Grid without having to alter the source code.

These domain metadata specifications in configuration are loaded during start time and are used by the user interface (`Kahuna`)
to render domain metadata sections and input fields in the image metadata panel. This configuration is also used by the
`metadata-editor` service to validate domain metadata updates via the metadata edit API.

For example, the configuration below specifies two specifications `specificationa` and `specificationb`, each with their respective fields.

```hocon
domainMetadata.specifications = [
  {
    # Uniquely identifies a specification
    name = "specificationa"

    # Represents a human readable name for the specification. Used to render domain metadata collapsible header on the
    # user interface.
    label = "Specification A"

    # Optional string that represents a human readable description of the specification. Rendered in the domain metadata
    # collapsible.
    description = "Description of specification A"

    # List of fields belonging to this particular specification.
    fields = [
      {
        # Uniquely identifies a field in a specification
        name = "field-a"

        # Used to render field name and input field label on the user interface.
        label = "Field A"

        # Represents the type of the field and it's value.
        # Valid / supported field type values are:
        #  - string - Represents text based values and renders a single-line text input field
        #  - integer - Represents numeric based values and renders numeric input field
        #  - datetime - Represents date and time values and renders a date and time input field
        #  - select - Represents text based values from controlled vocabularies and renders options as a drop-down list / select field.
        type = "string"

        # List of options rendered in the drop-down list / select field.
        # Mandatory for 'select' type.
        # options = ["Option 1", "Option 2"]
      }
      {
        name = "field-b"
        label = "Field B"
        type = "integer"
      }
      {
        name = "field-c"
        label = "Field C"
        type = "datetime"
      }
      {
        name = "field-d"
        label = "Field D"
        type = "select"
        options = ["Option 1", "Option 2"]
      }
    ]
  }
  {
    name = "specificationb"
    label = "Specification B"
    description: "Description of specification B"
    fields = [
      {
        name = "field-a"
        label = "Field A"
        type = "string"
      }
    ]
  }
]
```

Modification
--------

> *"With great power comes great responsibility"*

### Adding a field

New fields will be rendered on the user interface (`Kahuna`) under the domain metadata specification section and its value will be persisted during metadata updates.

### Removing a field

Removed fields will not be rendered on the user interface (`Kahuna`) under the domain metadata specification section (even if it has a value). Metadata updates will ignore the deleted field and its value will not be persisted.

### Updating a field type

Just like changing types on persistable models, this has its drawbacks and should be done at a minimum if possible. Changing types on fields that have values may not be backward compatible due to formatting or parsing errors that may occur.

The modified field and its value will be rendered on the user interface. However, formatting errors maybe thrown when rendering the edit (input) field on a field that already has a value. For example:

  * Changing the type from `string` to `integer`, the user interface will throw "Expected `String` to be a number" error and not render the value in the edit field.
	
  * Changing the type from `string` to `datetime`, the user interface will throw "Expected `11` to be a date" error.
	
  * Changing the type from `integer` to `datetime`, the user interface will throw "Expected `1` to be a date" error.

Despite these format errors, a user can still modify and save the value of the field using the new type on the user interface.

**TIP** Aim to make the choice of field types as final as possible to avoid any client-side format errors.
