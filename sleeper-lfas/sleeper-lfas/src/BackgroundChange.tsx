interface IProps {
  color: string;
}
export default function ColorButton(props: IProps) {
  return (
    <button
      className="color-button"
      style={{
        backgroundColor: props.color,
        width: "100%",
        height: "100%",
        margin: "0px",
        padding: "0px",
        border: "none",
        outline: "none",
        cursor: "pointer",
        transition: "all 0.3s ease-in-out",
      }}
    ></button>
  );
}
