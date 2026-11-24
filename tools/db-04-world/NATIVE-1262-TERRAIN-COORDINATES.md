# Steam 1.26.2 source-local placement to terrain coordinates

Original GameAssembly SHA256: `a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653`, matches the supplied DB-04 1.26.2 manifest. Dump SHA256: `0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08`. The method RVAs below were confirmed by inspecting actual PE instructions, not only declarations.

| Method | RVA | Verified successful-path behavior |
| --- | --- | --- |
| Meta.Grids.GridObject.get_Position | 0x42AD4B0 | returns serialized signed X and Y from offsets 0x20 and 0x24 |
| Meta.Grids.Grid constructor | 0x42ADC80 | initializes factor field at 0x30 to 1 |
| Meta.Grids.Grid.get_Size | 0x42AF3E0 | multiplies both GridData dimensions by factor |
| Meta.Grids.Grid.GetFloorType | 0x42AF470 | signed integer division of both coordinates by factor, passes quotients to GridData.get_Item(int,int) at 0x3907D40 |
| Meta.Grids.Grid.Contains | 0x42AF520 | delegates with the same factor to GridData.Contains at 0x39078F0 |
| Definitions.Grid.GridData.Contains | 0x39078F0 | rejects negative coordinates and checks X < SizeX*factor, Y < SizeY*factor |

For full Save Grid records, an exact unique original layout/data path pair and matching factor establish the source-local mapping, not global world transforms. Missing factor uses the native constructor default. A mismatched factor, ambiguous source path, or DiffGrid is not projected. The raw terrain raster is version-pinned; runtime overrides and placement legality remain unverified. No game binary or Save content is committed.
