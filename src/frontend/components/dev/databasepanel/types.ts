export interface SchemaField {
  name: string
  type: string
  isId: boolean
  isUnique: boolean
  isOptional: boolean
  isList: boolean
  isRelation: boolean
  default?: string
}

export interface SchemaModel {
  name: string
  tableName: string
  fields: SchemaField[]
}

export interface SchemaEnum {
  name: string
  values: string[]
}

export interface SchemaRelation {
  from: string
  fromField: string
  to: string
  toField: string
  onDelete?: string
}

export interface ParsedSchema {
  models: SchemaModel[]
  enums: SchemaEnum[]
  relations: SchemaRelation[]
}
