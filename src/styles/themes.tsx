import { createTheme, Input, TextInput } from "@mantine/core";

export const themes = {
  ELF: createTheme({
    colors: {
      brand: ['#e0ffe5', '#b3ffcc', '#80ffb3', '#4dff99', '#1aff80', '#00e673', '#00b35a', '#008040', '#004d26', '#001a0d'],
      secondary: ['#fff4e0', '#ffe8b3', '#ffdc80', '#ffd04d', '#ffc31a', '#e6b200', '#b38a00', '#806300', '#4d3c00', '#1a1500'],
    },
    primaryColor: 'brand',
    components: {
      Input: Input.extend({
        defaultProps: {
          color: 'gray',
        },
      }),
      TextInput: TextInput.extend({
        defaultProps: {
          color: 'gray',
        },
      }),

      InputWrapper: Input.Wrapper.extend({
        defaultProps: {
          inputWrapperOrder: ['label', 'input', 'description', 'error'],
        },
      }),
    },
  }),
  HUMAN: createTheme({
    colors: {
      brand: ['#e0f4ff', '#b3e0ff', '#80ccff', '#4db8ff', '#1aa3ff', '#0088e6', '#006bb3', '#004d80', '#002f4d', '#00121a'],
      secondary: ['#f0f0f0', '#d9d9d9', '#c2c2c2', '#ababab', '#949494', '#7d7d7d', '#666666', '#4f4f4f', '#383838', '#212121'],
    },
    primaryColor: 'brand',
  }),
  UNDEAD: createTheme({
    colors: {
      brand: ['#d9d9d9', '#bfbfbf', '#a6a6a6', '#8c8c8c', '#737373', '#595959', '#404040', '#262626', '#0d0d0d', '#000000'],
      secondary: [
        '#e0e0e0', '#b3b3b3', '#808080', '#4d4d4d', '#1a1a1a', '#000000',
        '#334455', '#667788', '#99aabb', '#ccddee'
      ],
    },
    primaryColor: 'brand',
  }),
  GOBLIN: createTheme({
    colors: {
      brand: ['#ffe0e0', '#ffb3b3', '#ff8080', '#ff4d4d', '#ff1a1a', '#e60000', '#b30000', '#800000', '#4d0000', '#1a0000'],
      secondary: ['#e6ccb3', '#cc9966', '#b36d00', '#995200', '#804000', '#663300', '#4d2600', '#331a00', '#1a0d00', '#000000'],
    },
    primaryColor: 'brand',
  }),
};
