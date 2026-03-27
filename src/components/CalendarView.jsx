import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import styles from '../styles/CalendarView.module.css';

export default function CalendarView({ tasks, onDateClick, onTaskClick }) {
  const today = new Date().toISOString().split('T')[0];

  const events = tasks.map((task) => {
    const isOverdue =
      task.status !== 'done' && task.finishDate && task.finishDate < today;
    const event = {
      id: task.id,
      title: task.title,
      start: task.date,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      textColor: isOverdue ? '#eb5757' : undefined,
      extendedProps: { task },
    };

    if (task.finishDate && task.finishDate > task.date) {
      const endDate = new Date(task.finishDate + 'T12:00:00');
      endDate.setDate(endDate.getDate() + 1);
      event.end = endDate.toISOString().split('T')[0];
    }

    return event;
  });

  return (
    <div className={styles.container}>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale="pt-br"
        headerToolbar={{
          left: 'title',
          center: '',
          right: 'prev,next today',
        }}
        events={events}
        dateClick={(info) => onDateClick(info.dateStr)}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          onTaskClick(info.event.extendedProps.task);
        }}
        height="auto"
        dayMaxEvents={false}
        buttonText={{
          today: 'Hoje',
        }}
        fixedWeekCount={false}
      />
    </div>
  );
}
